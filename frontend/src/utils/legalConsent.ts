const API_EXTERNAL_SERVICE_CONSENT_KEY = "fapiao:api-external-service-consent:v1";
const RPA_EXTERNAL_SERVICE_CONSENT_KEY = "fapiao:rpa-external-service-consent:v1";

export function getApiExternalServiceConsent(): boolean {
  try {
    return localStorage.getItem(API_EXTERNAL_SERVICE_CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setApiExternalServiceConsent(consented: boolean): void {
  try {
    if (consented) {
      localStorage.setItem(API_EXTERNAL_SERVICE_CONSENT_KEY, "1");
    } else {
      localStorage.removeItem(API_EXTERNAL_SERVICE_CONSENT_KEY);
    }
  } catch (error) {
    console.warn("persist consent failed", error);
  }
}

export function getRpaExternalServiceConsent(): boolean {
  try {
    return localStorage.getItem(RPA_EXTERNAL_SERVICE_CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setRpaExternalServiceConsent(consented: boolean): void {
  try {
    if (consented) {
      localStorage.setItem(RPA_EXTERNAL_SERVICE_CONSENT_KEY, "1");
    } else {
      localStorage.removeItem(RPA_EXTERNAL_SERVICE_CONSENT_KEY);
    }
  } catch (error) {
    console.warn("persist consent failed", error);
  }
}
