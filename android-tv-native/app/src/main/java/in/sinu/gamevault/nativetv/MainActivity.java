package in.sinu.gamevault.nativetv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.net.URLEncoder;
import java.util.List;
import org.json.JSONObject;

public final class MainActivity extends Activity implements VaultTvView.Actions, DriveRepository.Listener, ServiceRepository.Listener {
    private VaultTvView tv;
    private DriveRepository drive;
    private ServiceRepository services;
    private VaultData currentData;
    private final Handler saveHandler = new Handler(Looper.getMainLooper());
    private Runnable pendingDriveSave;
    private boolean initialSyncStarted;
    private long lastResumeSync;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|View.SYSTEM_UI_FLAG_LAYOUT_STABLE|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        drive=new DriveRepository(this);services=new ServiceRepository(this);tv=new VaultTvView(this,this);tv.setBackgroundColor(Color.rgb(5,8,13));setContentView(tv);tv.requestFocus();
        currentData=drive.cached();tv.setData(currentData);tv.setDriveConnected(drive.connected());
        services.importTrustedConfig(currentData.root.optJSONObject("trustedDeviceConfig"));
        if(services.plexConfigured())services.loadPlex(this);
        if(services.biglyConfigured()&&services.biglyConnected())services.loadBigly(this);
    }

    @Override protected void onResume(){super.onResume();long now=System.currentTimeMillis();if(drive.connected()&&(!initialSyncStarted||now-lastResumeSync>300000L)){initialSyncStarted=true;lastResumeSync=now;drive.sync(this);}if(tv!=null)tv.requestFocus();}

    @Override public void onBackPressed(){if(tv!=null&&tv.handleBack())return;super.onBackPressed();}

    @Override public void syncDrive(){drive.sync(this);}
    @Override public void connectDrive(){drive.startDeviceLogin(this);}
    @Override public void disconnectDrive(){drive.disconnect();tv.setDriveConnected(false);tv.setStatus("Google Drive disconnected");}

    @Override public void configureDrive(){
        showFields("Google Drive TV OAuth",new String[]{"TV OAuth Client ID","Client secret (optional)"},new String[]{drive.clientId(),drive.clientSecret()},true,values->{drive.configure(values[0],values[1]);tv.setStatus("OAuth configuration saved");drive.startDeviceLogin(this);});
    }

    @Override public void configurePlex(){
        showFields("Plex Library",new String[]{"Server URL (leave blank to discover)","X-Plex-Token from Plex Web > Get Info > View XML"},new String[]{services.plexUrl(),""},true,values->{services.configurePlex(values[0],values[1]);tv.setStatus("Plex configuration saved");if(values[0].isEmpty())services.discoverPlex(this);else services.loadPlex(this);});
    }

    @Override public void refreshPlex(){services.loadPlex(this);}

    @Override public void configureBigly(){
        showFields("BiglyBT",new String[]{"HTTPS Worker gateway","BiglyBT username","BiglyBT password"},new String[]{services.biglyUrl(),"",""},true,values->{services.configureBigly(values[0]);tv.setStatus("Connecting to BiglyBT...");services.biglyLogin(values[1],values[2],this);});
    }

    @Override public void loginBigly(){configureBigly();}
    @Override public void refreshBigly(){if(services.biglyConnected())services.loadBigly(this);else configureBigly();}
    @Override public void clearArtwork(){tv.clearArtwork();tv.setStatus("Artwork cache cleared");}

    @Override public void loadStory(MediaItem item){tv.setStatus("Loading Wikipedia story...");services.loadStory(item,this);}
    @Override public void loadEpisodes(MediaItem item,int season){tv.setStatus("Loading season "+season+"...");services.loadEpisodes(item,season,this);}

    @Override public void rateItem(MediaItem item){
        showFields("Personal rating",new String[]{"Rating from 0 to 10 (0 clears it)"},
            new String[]{first(item.raw,"userRating","myRating")},false,values->{
                double rating;
                try{rating=Double.parseDouble(values[0].trim());}catch(Exception ex){tv.setStatus("Enter a rating from 0 to 10");return;}
                if(rating<0||rating>10){tv.setStatus("Rating must be from 0 to 10");return;}
                JSONObject change=new JSONObject();try{change.put("userRating",rating);}catch(Exception ignored){}
                saveItemEdit(item,change);
            });
    }

    @Override public void editItem(MediaItem item){
        if(item==null)return;
        if("rental".equals(item.source)||"rentalHistory".equals(item.source)){
            showFields("Edit rental",new String[]{"Return date (YYYY-MM-DD)","Vendor","Rental cost","Remarks"},
                new String[]{first(item.raw,"returnDate","end"),first(item.raw,"vendor"),first(item.raw,"cost"),first(item.raw,"remarks","note")},false,
                values->{JSONObject change=new JSONObject();try{change.put("returnDate",values[0]);if("rentalHistory".equals(item.source))change.put("end",values[0]);change.put("vendor",values[1]);change.put("cost",values[2]);change.put("remarks",values[3]);}catch(Exception ignored){}saveItemEdit(item,change);});
            return;
        }
        if("subscriptions".equals(item.source)){
            showFields("Edit subscription",new String[]{"Renewal date (YYYY-MM-DD)","Service","Cost per cycle","Remarks"},
                new String[]{first(item.raw,"renewsAt","end"),first(item.raw,"service","name"),first(item.raw,"cost","monthlyCost"),first(item.raw,"remarks","note")},false,
                values->{JSONObject change=new JSONObject();try{change.put("renewsAt",values[0]);change.put("service",values[1]);change.put("cost",values[2]);change.put("remarks",values[3]);}catch(Exception ignored){}saveItemEdit(item,change);});
            return;
        }
        showFields("Edit title",new String[]{"Status","Release date (YYYY-MM-DD)","Provider / platform","Remarks"},
            new String[]{first(item.raw,"status","state"),first(item.raw,"date","releaseDate"),first(item.raw,"provider","platform"),first(item.raw,"remarks","note")},false,
            values->{JSONObject change=new JSONObject();try{change.put("status",values[0]);change.put("date",values[1]);change.put("provider",values[2]);change.put("remarks",values[3]);}catch(Exception ignored){}saveItemEdit(item,change);});
    }

    private void saveItemEdit(MediaItem item,JSONObject change){
        if(currentData==null||!currentData.updateItem(item,change)){tv.setStatus("This synced catalog item is view-only");return;}
        drive.cache(currentData);tv.setData(currentData);tv.setStatus("Changes saved locally");
        if(pendingDriveSave!=null)saveHandler.removeCallbacks(pendingDriveSave);
        pendingDriveSave=()->drive.save(currentData,this);saveHandler.postDelayed(pendingDriveSave,2500L);
    }

    @Override public void plexAction(MediaItem item,String action){
        String message="delete".equals(action)?"Permanently delete this title and its media files from Plex?":"Mark this title watched in Plex?";
        new AlertDialog.Builder(this,AlertDialog.THEME_DEVICE_DEFAULT_DARK).setTitle("Confirm Plex action").setMessage(message).setNegativeButton("Cancel",null).setPositiveButton("Confirm",(d,w)->services.plexAction(item,action,this)).show();
    }

    @Override public void biglyAction(String id,String action){
        boolean destructive=action.startsWith("remove");
        if(!destructive){services.biglyAction(id,action,this);return;}
        String message="remove_files".equals(action)?"Remove this torrent and permanently delete its downloaded files?":"Remove this torrent but keep its downloaded files?";
        new AlertDialog.Builder(this,AlertDialog.THEME_DEVICE_DEFAULT_DARK).setTitle("Confirm removal").setMessage(message).setNegativeButton("Cancel",null).setPositiveButton("Remove",(d,w)->services.biglyAction(id,action,this)).show();
    }

    @Override public void updateLibrary(MediaItem item,String action){
        boolean confirm="return".equals(action)||"watched".equals(action)||"completed".equals(action)||"not_interested".equals(action);
        if(!confirm){applyLibraryAction(item,action);return;}
        String label="return".equals(action)?"Return and complete this rental?":"Mark \""+item.title+"\" as "+action.replace('_',' ')+"?";
        new AlertDialog.Builder(this,AlertDialog.THEME_DEVICE_DEFAULT_DARK)
            .setTitle("Confirm change").setMessage(label).setNegativeButton("Cancel",null)
            .setPositiveButton("Confirm",(dialog,which)->applyLibraryAction(item,action)).show();
    }

    private void applyLibraryAction(MediaItem item,String action){
        if(currentData==null||!currentData.applyAction(item,action)){tv.setStatus("This change could not be applied");return;}
        drive.cache(currentData);tv.setData(currentData);tv.setStatus(actionLabel(action));
        if(pendingDriveSave!=null)saveHandler.removeCallbacks(pendingDriveSave);
        pendingDriveSave=()->drive.save(currentData,this);
        saveHandler.postDelayed(pendingDriveSave,2500L);
    }

    private String actionLabel(String action){
        if("watchlist".equals(action))return "Added to Watchlist";
        if("watching".equals(action))return "Moved to Watching";
        if("watched".equals(action))return "Marked as Watched";
        if("queue".equals(action))return "Added to Rental Queue";
        if("playing".equals(action))return "Moved to Playing";
        if("purchased".equals(action))return "Added to Purchased on Steam";
        if("completed".equals(action))return "Marked as Completed";
        if("return".equals(action))return "Rental returned and completed";
        if("not_interested".equals(action))return "Moved to Not Interested";
        return "Library updated";
    }

    @Override public void openYouTube(String query){
        try{
            Uri uri=Uri.parse("https://www.youtube.com/results?search_query="+URLEncoder.encode(query,"UTF-8"));
            Intent intent=new Intent(Intent.ACTION_VIEW,uri);intent.setPackage("com.google.android.youtube.tv");intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);startActivity(intent);
        }catch(ActivityNotFoundException e){openWeb("https://www.youtube.com/results?search_query="+Uri.encode(query));}catch(Exception e){toast("YouTube could not be opened");}
    }

    @Override public void openWeb(String url){try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(Exception e){toast("No app can open this link");}}

    @Override public void onStatus(String message){runOnUiThread(()->{tv.setStatus(message);tv.setDriveConnected(drive.connected());});}
    @Override public void onData(VaultData data){runOnUiThread(()->{
        currentData=data;tv.hideQr();tv.setData(data);tv.setDriveConnected(true);
        boolean restored=services.importTrustedConfig(data.root.optJSONObject("trustedDeviceConfig"));
        if(restored)tv.setStatus("Drive synced; trusted device settings restored");
        if(services.plexConfigured())services.loadPlex(this);
        if(services.biglyConfigured()&&services.biglyConnected())services.loadBigly(this);
    });}
    @Override public void onDeviceCode(String verificationUrl,String userCode,long expiresAt){runOnUiThread(()->tv.showQr(verificationUrl,userCode,expiresAt));}
    @Override public void onPlex(List<MediaItem> items){runOnUiThread(()->tv.setPlex(items));}
    @Override public void onBigly(List<ServiceRepository.TorrentItem> items){runOnUiThread(()->tv.setTorrents(items));}
    @Override public void onPlexServer(String url){runOnUiThread(()->tv.setStatus("Plex found at "+url));}
    @Override public void onEpisodes(MediaItem item,int season,List<ServiceRepository.EpisodeItem> episodes){runOnUiThread(()->tv.setEpisodes(item,season,episodes));}
    @Override public void onStory(MediaItem item,String story){runOnUiThread(()->{tv.setDetailStory(item,story);JSONObject change=new JSONObject();try{change.put("plot",story);}catch(Exception ignored){}if(currentData!=null&&currentData.updateItem(item,change)){drive.cache(currentData);pendingDriveSave=()->drive.save(currentData,this);saveHandler.postDelayed(pendingDriveSave,2500L);}});}

    private interface ValuesCallback{void accept(String[] values);}

    private void showFields(String title,String[] labels,String[] initial,boolean passwordLast,ValuesCallback callback){
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);int pad=dp(28);box.setPadding(pad,dp(10),pad,0);EditText[] fields=new EditText[labels.length];
        for(int i=0;i<labels.length;i++){TextView label=new TextView(this);label.setText(labels[i]);label.setTextColor(Color.rgb(210,222,236));label.setTextSize(16);label.setPadding(0,dp(12),0,dp(5));box.addView(label);EditText field=new EditText(this);field.setSingleLine(true);field.setText(i<initial.length?initial[i]:"");field.setTextColor(Color.WHITE);field.setHintTextColor(Color.GRAY);field.setBackgroundColor(Color.rgb(10,18,29));field.setPadding(dp(14),0,dp(14),0);field.setMinHeight(dp(52));if(passwordLast&&i==labels.length-1)field.setInputType(0x00000081);fields[i]=field;box.addView(field,new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,dp(58)));}
        AlertDialog dialog=new AlertDialog.Builder(this,AlertDialog.THEME_DEVICE_DEFAULT_DARK).setTitle(title).setView(box).setNegativeButton("Cancel",null).setPositiveButton("Save",null).create();dialog.setOnShowListener(x->{dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{String[] values=new String[fields.length];for(int i=0;i<fields.length;i++)values[i]=fields[i].getText().toString().trim();dialog.dismiss();callback.accept(values);});fields[0].requestFocus();});dialog.show();
    }

    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private void toast(String message){Toast.makeText(this,message,Toast.LENGTH_SHORT).show();}
    private static String first(JSONObject object,String...keys){if(object==null)return "";for(String key:keys){String value=object.optString(key);if(!value.isEmpty())return value;}return "";}
}
