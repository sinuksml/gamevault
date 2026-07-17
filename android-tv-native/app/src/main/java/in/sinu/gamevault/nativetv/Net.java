package in.sinu.gamevault.nativetv;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

final class Net {
    static final class Response {
        final int code;
        final String body;
        Response(int code, String body) { this.code = code; this.body = body; }
        JSONObject json() { try { return new JSONObject(body); } catch (Exception e) { return new JSONObject(); } }
    }

    static Response request(String url, String method, Map<String,String> headers, String body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(20000);
        c.setRequestMethod(method == null ? "GET" : method);
        c.setUseCaches(false);
        if (headers != null) for (Map.Entry<String,String> h : headers.entrySet()) c.setRequestProperty(h.getKey(), h.getValue());
        if (body != null) {
            c.setDoOutput(true);
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = c.getOutputStream()) { out.write(bytes); }
        }
        int code = c.getResponseCode();
        InputStream input = code >= 400 ? c.getErrorStream() : c.getInputStream();
        StringBuilder result = new StringBuilder();
        if (input != null) try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            String line; while ((line = reader.readLine()) != null) result.append(line).append('\n');
        }
        c.disconnect();
        return new Response(code, result.toString());
    }

    static String form(Map<String,String> values) throws Exception {
        StringBuilder out = new StringBuilder();
        for (Map.Entry<String,String> e : values.entrySet()) {
            if (out.length() > 0) out.append('&');
            out.append(URLEncoder.encode(e.getKey(), "UTF-8")).append('=').append(URLEncoder.encode(e.getValue(), "UTF-8"));
        }
        return out.toString();
    }

    private Net() { }
}
