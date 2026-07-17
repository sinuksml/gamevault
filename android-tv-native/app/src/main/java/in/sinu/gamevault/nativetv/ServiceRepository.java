package in.sinu.gamevault.nativetv;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import java.io.ByteArrayInputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.xml.parsers.DocumentBuilderFactory;

final class ServiceRepository {
    interface Listener {
        void onStatus(String status);
        void onPlex(List<MediaItem> items);
        void onBigly(List<TorrentItem> items);
    }

    static final class TorrentItem {
        final String id, name, status;
        final long downloaded, total, downSpeed, upSpeed, eta;
        final int progress, peers, seeds;
        TorrentItem(String id, String name, String status, long downloaded, long total,
                    long downSpeed, long upSpeed, long eta, int progress, int peers, int seeds) {
            this.id=id;this.name=name;this.status=status;this.downloaded=downloaded;this.total=total;
            this.downSpeed=downSpeed;this.upSpeed=upSpeed;this.eta=eta;this.progress=progress;this.peers=peers;this.seeds=seeds;
        }
    }

    private final SecurePrefs secure;
    private final android.content.SharedPreferences prefs;
    private final ExecutorService io = Executors.newFixedThreadPool(2);

    ServiceRepository(Context context) {
        secure = new SecurePrefs(context);
        prefs = context.getSharedPreferences("native_tv", Context.MODE_PRIVATE);
    }

    void configurePlex(String url, String token) {
        prefs.edit().putString("plex_url", clean(url)).apply();
        if (token != null && !token.trim().isEmpty()) secure.put("plex_token", token.trim());
    }
    String plexUrl() { return prefs.getString("plex_url", ""); }
    boolean plexConfigured() { return !plexUrl().isEmpty() && !secure.get("plex_token").isEmpty(); }

    void configureBigly(String url) { prefs.edit().putString("bigly_url", clean(url)).apply(); }
    String biglyUrl() { return prefs.getString("bigly_url", ""); }
    boolean biglyConfigured() { return !biglyUrl().isEmpty(); }
    boolean biglyConnected() { return !secure.get("bigly_token").isEmpty(); }

    boolean importTrustedConfig(JSONObject config) {
        if (config == null) return false;
        boolean changed = false;
        JSONObject api = config.optJSONObject("api");
        if (api != null) {
            changed |= putSecretIfPresent("rawg_key", api.optString("rawg"));
            changed |= putSecretIfPresent("tmdb_key", api.optString("tmdb"));
            changed |= putSecretIfPresent("omdb_key", api.optString("omdb"));
        }
        JSONObject plex = config.optJSONObject("plex");
        if (plex != null) {
            String url = clean(plex.optString("url"));
            if (!url.isEmpty() && !url.equals(plexUrl())) { prefs.edit().putString("plex_url", url).apply(); changed = true; }
            changed |= putSecretIfPresent("plex_token", plex.optString("token"));
        }
        JSONObject bigly = config.optJSONObject("bigly");
        if (bigly != null) {
            String url = clean(bigly.optString("url"));
            if (!url.isEmpty() && !url.equals(biglyUrl())) { prefs.edit().putString("bigly_url", url).apply(); changed = true; }
            changed |= putSecretIfPresent("bigly_token", bigly.optString("token"));
        }
        return changed;
    }

    private boolean putSecretIfPresent(String key, String value) {
        if (value == null || value.trim().isEmpty() || value.trim().equals(secure.get(key))) return false;
        secure.put(key, value.trim());
        return true;
    }

    void loadPlex(Listener listener) {
        io.execute(() -> {
            if (!plexConfigured()) { listener.onStatus("Configure Plex in Settings."); return; }
            try {
                listener.onStatus("Refreshing Plex library...");
                String token = secure.get("plex_token");
                Net.Response sections = Net.request(plexUrl()+"/library/sections?X-Plex-Token="+enc(token), "GET", null, null);
                if (sections.code >= 400) throw new Exception(sections.code == 401 ? "Plex token was rejected." : "Plex returned " + sections.code);
                Document doc = xml(sections.body); NodeList dirs = doc.getElementsByTagName("Directory");
                List<MediaItem> result = new ArrayList<>();
                for (int i=0;i<dirs.getLength();i++) {
                    Element section=(Element)dirs.item(i); String type=section.getAttribute("type");
                    if (!"movie".equals(type)&&!"show".equals(type)) continue;
                    String key=section.getAttribute("key");
                    Net.Response media=Net.request(plexUrl()+"/library/sections/"+enc(key)+"/all?X-Plex-Container-Size=5000&X-Plex-Token="+enc(token),"GET",null,null);
                    if(media.code<400) parsePlex(media.body,type,result);
                }
                listener.onPlex(result); listener.onStatus("Plex library updated");
            } catch(Exception e){listener.onStatus(e.getMessage()==null?"Plex refresh failed":e.getMessage());}
        });
    }

    void biglyLogin(String username, String password, Listener listener) {
        io.execute(() -> {
            try {
                if (!biglyConfigured()) throw new Exception("Configure the BiglyBT gateway first.");
                JSONObject body=new JSONObject();body.put("username",username);body.put("password",password);
                Map<String,String> h=new HashMap<>();h.put("Content-Type","application/json");
                Net.Response response=Net.request(biglyUrl()+"/__native/login","POST",h,body.toString());
                JSONObject json=response.json(); if(response.code>=400||json.optString("token").isEmpty())throw new Exception(json.optString("message","BiglyBT login failed"));
                secure.put("bigly_token",json.optString("token")); loadBigly(listener);
            }catch(Exception e){listener.onStatus(e.getMessage()==null?"BiglyBT login failed":e.getMessage());}
        });
    }

    void loadBigly(Listener listener) {
        io.execute(() -> {
            try {
                String token=secure.get("bigly_token"); if(token.isEmpty())throw new Exception("Sign in to BiglyBT from Settings.");
                JSONArray fields=new JSONArray();String[] names={"id","name","status","percentDone","eta","rateDownload","rateUpload","peersConnected","peersGettingFromUs","totalSize","sizeWhenDone","leftUntilDone","downloadedEver","isFinished"};for(String n:names)fields.put(n);
                JSONObject args=new JSONObject();args.put("fields",fields);JSONObject body=new JSONObject();body.put("method","torrent-get");body.put("arguments",args);
                Map<String,String> h=new HashMap<>();h.put("Content-Type","application/json");h.put("Authorization","Bearer "+token);
                Net.Response response=Net.request(biglyUrl()+"/__native/api","POST",h,body.toString());JSONObject json=response.json();
                if(response.code==401){secure.remove("bigly_token");throw new Exception("BiglyBT login expired. Sign in again.");}
                if(response.code>=400||!"success".equals(json.optString("result")))throw new Exception(json.optString("message","BiglyBT is unavailable"));
                JSONArray torrents=json.optJSONObject("arguments")==null?new JSONArray():json.optJSONObject("arguments").optJSONArray("torrents");
                List<TorrentItem> result=new ArrayList<>(); if(torrents!=null)for(int i=0;i<torrents.length();i++){JSONObject t=torrents.optJSONObject(i);if(t==null)continue;long total=Math.max(t.optLong("sizeWhenDone"),t.optLong("totalSize"));long downloaded=Math.max(t.optLong("downloadedEver"),total-t.optLong("leftUntilDone"));int pct=(int)Math.round(Math.max(0,Math.min(1,t.optDouble("percentDone",0)))*100);result.add(new TorrentItem(t.optString("id"),t.optString("name","Untitled torrent"),status(t),downloaded,total,t.optLong("rateDownload"),t.optLong("rateUpload"),t.optLong("eta"),pct,t.optInt("peersConnected"),t.optInt("peersGettingFromUs")));}
                listener.onBigly(result);listener.onStatus("BiglyBT updated");
            }catch(Exception e){listener.onStatus(e.getMessage()==null?"BiglyBT refresh failed":e.getMessage());}
        });
    }

    private void parsePlex(String source,String type,List<MediaItem> out)throws Exception{
        Document doc=xml(source);NodeList nodes=doc.getElementsByTagName("Metadata");if(nodes.getLength()==0)nodes=doc.getElementsByTagName("Video");
        for(int i=0;i<nodes.getLength();i++){Element e=(Element)nodes.item(i);String title=e.getAttribute("title");if(title.isEmpty())continue;long duration=longAttr(e,"duration"),offset=longAttr(e,"viewOffset");int progress="show".equals(type)?ratio(longAttr(e,"viewedLeafCount"),longAttr(e,"leafCount")):ratio(offset,duration);String thumb=plexImage(e.getAttribute("thumb")),art=plexImage(e.getAttribute("art"));String year=e.getAttribute("year"),summary=e.getAttribute("summary");JSONObject raw=new JSONObject();raw.put("ratingKey",e.getAttribute("ratingKey"));raw.put("type",type);out.add(new MediaItem(e.getAttribute("ratingKey"),"show".equals(type)?"series":"movie","plex",title,"Plex "+("show".equals(type)?"TV Series":"Movie"),(year.isEmpty()?"":year)+(progress>0?" · "+progress+"% watched":""),thumb,art,summary,progress,raw));}
    }

    private String plexImage(String path){if(path==null||path.isEmpty())return "";return plexUrl()+path+"?X-Plex-Token="+urlToken();}
    private String urlToken(){try{return URLEncoder.encode(secure.get("plex_token"),"UTF-8");}catch(Exception e){return "";}}
    private static Document xml(String source)throws Exception{return DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(new ByteArrayInputStream(source.getBytes(StandardCharsets.UTF_8)));}
    private static long longAttr(Element e,String k){try{return Long.parseLong(e.getAttribute(k));}catch(Exception ignored){return 0;}}
    private static int ratio(long a,long b){return b<=0?0:(int)Math.max(0,Math.min(100,Math.round(a*100f/b)));}
    private static String status(JSONObject t){if(t.optBoolean("isFinished")||t.optDouble("percentDone")>=1)return "Completed";int s=t.optInt("status");if(s==4)return "Downloading";if(s==6)return "Seeding";if(s==0)return "Paused";return "Queued";}
    private static String clean(String value){return value==null?"":value.trim().replaceAll("/+$","");}
    private static String enc(String value)throws Exception{return URLEncoder.encode(value,"UTF-8");}
}
