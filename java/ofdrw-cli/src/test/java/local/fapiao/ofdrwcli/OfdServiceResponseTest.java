package local.fapiao.ofdrwcli;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class OfdServiceResponseTest {

    @Test
    void shouldBuildReadyResponse() {
        Map<String, Object> response = OfdServiceResponse.ready();

        assertEquals("ready", response.get("type"));
        assertEquals(0, response.get("code"));
    }

    @Test
    void shouldBuildSuccessResponse() {
        Map<String, Object> result = Map.of("outputPath", "C:/temp/out.pdf");
        Map<String, Object> response = OfdServiceResponse.success("7", result);

        assertEquals("7", response.get("id"));
        assertEquals(true, response.get("ok"));
        assertEquals(0, response.get("code"));
        assertEquals(result, response.get("result"));
    }

    @Test
    void shouldMapBusinessFailureToCodeOne() {
        Map<String, Object> response = OfdServiceResponse.failure("8", new IllegalArgumentException("bad request"));

        assertEquals("8", response.get("id"));
        assertEquals(false, response.get("ok"));
        assertEquals(1, response.get("code"));
        assertEquals("bad request", response.get("error"));
    }

    @Test
    void shouldMapSystemFailureToCodeTwo() {
        Map<String, Object> response = OfdServiceResponse.failure("9", new IllegalStateException("broken state"));

        assertEquals("9", response.get("id"));
        assertEquals(false, response.get("ok"));
        assertEquals(2, response.get("code"));
        assertEquals("broken state", response.get("error"));
    }

    @Test
    void shouldFallBackToExceptionTypeNameWhenMessageMissing() {
        Map<String, Object> response = OfdServiceResponse.failure("10", new RuntimeException());

        assertEquals("10", response.get("id"));
        assertEquals(false, response.get("ok"));
        assertEquals(2, response.get("code"));
        assertEquals("RuntimeException", response.get("error"));
    }

    @Test
    void shouldFallBackToExceptionTypeNameWhenMessageBlank() {
        Map<String, Object> response = OfdServiceResponse.failure("11", new IllegalArgumentException("   "));

        assertEquals("11", response.get("id"));
        assertEquals(false, response.get("ok"));
        assertEquals(1, response.get("code"));
        assertEquals("IllegalArgumentException", response.get("error"));
    }
}
