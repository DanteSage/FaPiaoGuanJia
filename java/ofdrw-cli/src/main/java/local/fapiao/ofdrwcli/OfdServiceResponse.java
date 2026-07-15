package local.fapiao.ofdrwcli;

import com.google.gson.JsonParseException;

import java.util.LinkedHashMap;
import java.util.Map;

final class OfdServiceResponse {
    static final int CODE_SUCCESS = 0;
    static final int CODE_BUSINESS_ERROR = 1;
    static final int CODE_SYSTEM_ERROR = 2;

    private OfdServiceResponse() {
    }

    static Map<String, Object> ready() {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("type", "ready");
        response.put("code", CODE_SUCCESS);
        return response;
    }

    static Map<String, Object> success(String requestId, Object result) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id", requestId);
        response.put("ok", true);
        response.put("code", CODE_SUCCESS);
        response.put("result", result);
        return response;
    }

    static Map<String, Object> failure(String requestId, Exception exception) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id", requestId);
        response.put("ok", false);
        response.put("code", resolveCode(exception));
        response.put("error", resolveMessage(exception));
        return response;
    }

    private static int resolveCode(Exception exception) {
        if (exception instanceof IllegalArgumentException || exception instanceof JsonParseException) {
            return CODE_BUSINESS_ERROR;
        }

        return CODE_SYSTEM_ERROR;
    }

    private static String resolveMessage(Exception exception) {
        String message = exception.getMessage();
        if (message == null || message.isBlank()) {
            return exception.getClass().getSimpleName();
        }
        return message;
    }
}
