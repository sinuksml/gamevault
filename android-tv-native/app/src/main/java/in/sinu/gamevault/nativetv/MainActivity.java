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

public final class MainActivity extends Activity implements VaultTvView.Actions, DriveRepository.Listener, ServiceRepository.Listener {
    private VaultTvView tv;
    private DriveRepository drive;
    private ServiceRepository services;
    private VaultData currentData;
    private final Handler saveHandler = new Handler(Looper.getMainLooper());
    private Runnable pendingDriveSave;
    private boolean initialSyncStarted;

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

    @Override protected void onResume(){super.onResume();if(!initialSyncStarted&&drive.connected()){initialSyncStarted=true;drive.sync(this);}if(tv!=null)tv.requestFocus();}

    @Override public void onBackPressed(){if(tv!=null&&tv.handleBack())return;super.onBackPressed();}

    @Override public void syncDrive(){drive.sync(this);}
    @Override public void connectDrive(){drive.startDeviceLogin(this);}
    @Override public void disconnectDrive(){drive.disconnect();tv.setDriveConnected(false);tv.setStatus("Google Drive disconnected");}

    @Override public void configureDrive(){
        showFields("Google Drive TV OAuth",new String[]{"TV OAuth Client ID","Client secret (optional)"},new String[]{drive.clientId(),drive.clientSecret()},true,values->{drive.configure(values[0],values[1]);tv.setStatus("OAuth configuration saved");drive.startDeviceLogin(this);});
    }

    @Override public void configurePlex(){
        showFields("Plex Library",new String[]{"Secure Plex server URL","X-Plex-Token"},new String[]{services.plexUrl(),""},true,values->{services.configurePlex(values[0],values[1]);tv.setStatus("Plex configuration saved");services.loadPlex(this);});
    }

    @Override public void refreshPlex(){services.loadPlex(this);}

    @Override public void configureBigly(){
        showFields("BiglyBT",new String[]{"HTTPS Worker gateway","BiglyBT username","BiglyBT password"},new String[]{services.biglyUrl(),"",""},true,values->{services.configureBigly(values[0]);tv.setStatus("Connecting to BiglyBT...");services.biglyLogin(values[1],values[2],this);});
    }

    @Override public void loginBigly(){configureBigly();}
    @Override public void refreshBigly(){if(services.biglyConnected())services.loadBigly(this);else configureBigly();}
    @Override public void clearArtwork(){tv.clearArtwork();tv.setStatus("Artwork cache cleared");}

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

    private interface ValuesCallback{void accept(String[] values);}

    private void showFields(String title,String[] labels,String[] initial,boolean passwordLast,ValuesCallback callback){
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);int pad=dp(28);box.setPadding(pad,dp(10),pad,0);EditText[] fields=new EditText[labels.length];
        for(int i=0;i<labels.length;i++){TextView label=new TextView(this);label.setText(labels[i]);label.setTextColor(Color.rgb(210,222,236));label.setTextSize(16);label.setPadding(0,dp(12),0,dp(5));box.addView(label);EditText field=new EditText(this);field.setSingleLine(true);field.setText(i<initial.length?initial[i]:"");field.setTextColor(Color.WHITE);field.setHintTextColor(Color.GRAY);field.setBackgroundColor(Color.rgb(10,18,29));field.setPadding(dp(14),0,dp(14),0);field.setMinHeight(dp(52));if(passwordLast&&i==labels.length-1)field.setInputType(0x00000081);fields[i]=field;box.addView(field,new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,dp(58)));}
        AlertDialog dialog=new AlertDialog.Builder(this,AlertDialog.THEME_DEVICE_DEFAULT_DARK).setTitle(title).setView(box).setNegativeButton("Cancel",null).setPositiveButton("Save",null).create();dialog.setOnShowListener(x->{dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{String[] values=new String[fields.length];for(int i=0;i<fields.length;i++)values[i]=fields[i].getText().toString().trim();dialog.dismiss();callback.accept(values);});fields[0].requestFocus();});dialog.show();
    }

    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private void toast(String message){Toast.makeText(this,message,Toast.LENGTH_SHORT).show();}
}
