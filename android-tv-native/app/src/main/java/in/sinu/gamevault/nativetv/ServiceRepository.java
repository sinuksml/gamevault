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
        void onStory(MediaItem item, String story);
        void onPlexServer(String url);
        void onEpisodes(MediaItem item, int season, List<EpisodeItem> episodes);
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

    static final class EpisodeItem {
        final int number;
        final String name, overview, airDate;
        final double rating;
        EpisodeItem(int number, String name, String overview, String airDate, double rating) {
            this.number=number;this.name=name;this.overview=overview;this.airDate=airDate;this.rating=rating;
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

    void discoverPlex(Listener listener) {
        io.execute(() -> {
            try {
                String token = secure.get("plex_token");
                if (token.isEmpty()) throw new Exception("Enter and save the X-Plex-Token first.");
                Map<String,String> headers = new HashMap<>();
                headers.put("X-Plex-Token", token); headers.put("X-Plex-Client-Identifier", "sinu-game-vault-native-tv");
                Net.Response response = Net.request("https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1", "GET", headers, null);
                if (response.code >= 400) throw new Exception("Plex discovery returned " + response.code + ".");
                Document doc = xml(response.body); NodeList devices = doc.getElementsByTagName("Device");
                String selected = "";
                for (int i = 0; i < devices.getLength() && selected.isEmpty(); i++) {
                    Element device = (Element) devices.item(i);
                    if (!device.getAttribute("provides").contains("server")) continue;
                    NodeList connections = device.getElementsByTagName("Connection");
                    for (int j = 0; j < connections.getLength(); j++) {
                        Element connection = (Element) connections.item(j);
                        String uri = connection.getAttribute("uri");
                        if (!uri.isEmpty() && ("1".equals(connection.getAttribute("local")) || selected.isEmpty())) selected = uri;
                    }
                }
                if (selected.isEmpty()) throw new Exception("No accessible Plex server was found for this token.");
                prefs.edit().putString("plex_url", clean(selected)).apply();
                listener.onPlexServer(clean(selected)); listener.onStatus("Plex server discovered"); loadPlex(listener);
            } catch (Exception e) { listener.onStatus(e.getMessage() == null ? "Plex discovery failed" : e.getMessage()); }
        });
    }

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

    void loadStory(MediaItem item, Listener listener) {
        io.execute(() -> {
            try {
                Map<String,String> headers = new HashMap<>(); headers.put("User-Agent", "SinuGameVaultNativeTV/3.0");
                String story = wikipediaStory(item, headers);
                if (story.isEmpty()) throw new Exception("Wikipedia did not return a story for this title.");
                listener.onStory(item, story);
                listener.onStatus("Wikipedia story loaded");
            } catch (Exception e) { listener.onStatus(e.getMessage() == null ? "Story loading failed" : e.getMessage()); }
        });
    }

    void loadEpisodes(MediaItem item, int season, Listener listener) {
        io.execute(() -> {
            try {
                String tmdbKey=secure.get("tmdb_key"), omdbKey=secure.get("omdb_key");
                String tmdbId=first(item.raw,"tmdbId","tmdb_id","id"), imdbId=first(item.raw,"imdbId","imdb_id","imdbID");
                if(tmdbKey.isEmpty()||tmdbId.isEmpty())throw new Exception("TMDB key or TV series ID is missing. Sync trusted settings from Windows/web.");
                Net.Response response=Net.request("https://api.themoviedb.org/3/tv/"+enc(tmdbId)+"/season/"+season+"?api_key="+enc(tmdbKey),"GET",null,null);
                if(response.code>=400)throw new Exception("TMDB episode lookup returned "+response.code+".");
                Map<Integer,Double> imdbRatings=new HashMap<>();
                if(!omdbKey.isEmpty()&&!imdbId.isEmpty()){
                    Net.Response omdb=Net.request("https://www.omdbapi.com/?apikey="+enc(omdbKey)+"&i="+enc(imdbId)+"&Season="+season,"GET",null,null);
                    JSONArray entries=omdb.json().optJSONArray("Episodes");
                    if(entries!=null)for(int i=0;i<entries.length();i++){JSONObject e=entries.optJSONObject(i);if(e==null)continue;try{imdbRatings.put(Integer.parseInt(e.optString("Episode")),Double.parseDouble(e.optString("imdbRating")));}catch(Exception ignored){}}
                }
                List<EpisodeItem> out=new ArrayList<>();JSONArray entries=response.json().optJSONArray("episodes");
                if(entries!=null)for(int i=0;i<entries.length();i++){JSONObject e=entries.optJSONObject(i);if(e==null)continue;int n=e.optInt("episode_number");double rating=imdbRatings.containsKey(n)?imdbRatings.get(n):e.optDouble("vote_average");out.add(new EpisodeItem(n,e.optString("name","Episode "+n),e.optString("overview"),e.optString("air_date"),rating));}
                listener.onEpisodes(item,season,out);listener.onStatus("Season "+season+" episodes loaded");
            }catch(Exception e){listener.onStatus(e.getMessage()==null?"Episode loading failed":e.getMessage());}
        });
    }

    private String wikipediaStory(MediaItem item, Map<String,String> headers) throws Exception {
        String qualifier = "game".equals(item.kind) ? " video game" : "series".equals(item.kind) ? " TV series" : " film";
        String searchUrl = "https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&utf8=1&srlimit=5&srsearch=" + enc(item.title + qualifier);
        Net.Response search = Net.request(searchUrl, "GET", headers, null);
        JSONArray results = search.json().optJSONObject("query") == null ? null : search.json().optJSONObject("query").optJSONArray("search");
        String page = results != null && results.length() > 0 ? results.optJSONObject(0).optString("title") : item.title;
        String sectionsUrl = "https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=sections&page=" + enc(page);
        Net.Response sections = Net.request(sectionsUrl, "GET", headers, null);
        JSONArray list = sections.json().optJSONObject("parse") == null ? null : sections.json().optJSONObject("parse").optJSONArray("sections");
        String sectionIndex = "";
        String[] preferred = {"plot", "story", "premise", "synopsis", "setting"};
        if (list != null) for (String wanted : preferred) {
            for (int i = 0; i < list.length(); i++) {
                JSONObject section = list.optJSONObject(i);
                if (section != null && section.optString("line").toLowerCase(Locale.US).contains(wanted)) { sectionIndex = section.optString("index"); break; }
            }
            if (!sectionIndex.isEmpty()) break;
        }
        if (!sectionIndex.isEmpty()) {
            String textUrl = "https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=text&page=" + enc(page) + "&section=" + enc(sectionIndex);
            Net.Response text = Net.request(textUrl, "GET", headers, null);
            JSONObject parse = text.json().optJSONObject("parse");
            JSONObject content = parse == null ? null : parse.optJSONObject("text");
            String html = content == null ? "" : content.optString("*");
            String plain = (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N
                    ? android.text.Html.fromHtml(html, android.text.Html.FROM_HTML_MODE_LEGACY)
                    : android.text.Html.fromHtml(html)).toString()
                .replaceAll("\\[[0-9]+]", "").replaceAll("(?m)^\\s*\\[edit]\\s*$", "").replaceAll("\\n{3,}", "\n\n").trim();
            if (!plain.isEmpty()) return plain.length() > 20000 ? plain.substring(0, 20000) : plain;
        }
        Net.Response summary = Net.request("https://en.wikipedia.org/api/rest_v1/page/summary/" + encPath(page), "GET", headers, null);
        return summary.code < 400 ? summary.json().optString("extract") : "";
    }

    void plexAction(MediaItem item, String action, Listener listener) {
        io.execute(() -> {
            try {
                if (!plexConfigured()) throw new Exception("Configure Plex in System first.");
                String key = item.raw == null ? "" : item.raw.optString("ratingKey");
                if (key.isEmpty()) throw new Exception("This Plex item has no library key.");
                String token = secure.get("plex_token");
                String method = "delete".equals(action) ? "DELETE" : "GET";
                String path = "delete".equals(action)
                    ? "/library/metadata/" + enc(key) + "?X-Plex-Token=" + enc(token)
                    : "/:/scrobble?key=" + enc(key) + "&identifier=com.plexapp.plugins.library&X-Plex-Token=" + enc(token);
                Net.Response response = Net.request(plexUrl() + path, method, null, null);
                if (response.code >= 400) throw new Exception("Plex returned " + response.code + ".");
                listener.onStatus("delete".equals(action) ? "Plex media deleted" : "Marked watched in Plex");
                loadPlex(listener);
            } catch (Exception e) { listener.onStatus(e.getMessage() == null ? "Plex action failed" : e.getMessage()); }
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

    void biglyAction(String id, String action, Listener listener) {
        io.execute(() -> {
            try {
                String token = secure.get("bigly_token");
                if (token.isEmpty()) throw new Exception("Sign in to BiglyBT from System.");
                String method = "start".equals(action) ? "torrent-start" : "pause".equals(action) ? "torrent-stop" : "torrent-remove";
                JSONObject args = new JSONObject();
                JSONArray ids = new JSONArray(); ids.put(parseTorrentId(id)); args.put("ids", ids);
                if ("remove_files".equals(action)) args.put("delete-local-data", true);
                JSONObject body = new JSONObject(); body.put("method", method); body.put("arguments", args);
                Map<String,String> h = new HashMap<>(); h.put("Content-Type", "application/json"); h.put("Authorization", "Bearer " + token);
                Net.Response response = Net.request(biglyUrl()+"/__native/api", "POST", h, body.toString());
                JSONObject json = response.json();
                if (response.code >= 400 || !"success".equals(json.optString("result"))) throw new Exception(json.optString("message", "BiglyBT action failed"));
                listener.onStatus("BiglyBT updated"); loadBigly(listener);
            } catch (Exception e) { listener.onStatus(e.getMessage() == null ? "BiglyBT action failed" : e.getMessage()); }
        });
    }

    private static Object parseTorrentId(String id) {
        try { return Long.parseLong(id); } catch (Exception ignored) { return id; }
    }

    private static String first(JSONObject object,String...keys){if(object==null)return "";for(String key:keys){String value=object.optString(key);if(!value.isEmpty())return value;}return "";}

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
    private static String encPath(String value)throws Exception{return enc(value).replace("+","%20");}
}
