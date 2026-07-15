import { describe, it, expect, beforeEach } from "vitest";
import {
  getApiExternalServiceConsent,
  setApiExternalServiceConsent,
  getRpaExternalServiceConsent,
  setRpaExternalServiceConsent,
} from "../../utils/legalConsent";

describe("legalConsent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("getApiExternalServiceConsent", () => {
    it("returns false when no consent stored", () => {
      expect(getApiExternalServiceConsent()).toBe(false);
    });

    it("returns true when consent stored as '1'", () => {
      localStorage.setItem("fapiao:api-external-service-consent:v1", "1");
      expect(getApiExternalServiceConsent()).toBe(true);
    });

    it("returns false when stored value is not '1'", () => {
      localStorage.setItem("fapiao:api-external-service-consent:v1", "0");
      expect(getApiExternalServiceConsent()).toBe(false);
    });
  });

  describe("setApiExternalServiceConsent", () => {
    it("stores consent when true", () => {
      setApiExternalServiceConsent(true);
      expect(localStorage.getItem("fapiao:api-external-service-consent:v1")).toBe("1");
    });

    it("removes consent when false", () => {
      localStorage.setItem("fapiao:api-external-service-consent:v1", "1");
      setApiExternalServiceConsent(false);
      expect(localStorage.getItem("fapiao:api-external-service-consent:v1")).toBeNull();
    });
  });

  describe("getRpaExternalServiceConsent", () => {
    it("returns false when no consent stored", () => {
      expect(getRpaExternalServiceConsent()).toBe(false);
    });

    it("returns true when consent stored", () => {
      localStorage.setItem("fapiao:rpa-external-service-consent:v1", "1");
      expect(getRpaExternalServiceConsent()).toBe(true);
    });
  });

  describe("setRpaExternalServiceConsent", () => {
    it("stores consent when true", () => {
      setRpaExternalServiceConsent(true);
      expect(localStorage.getItem("fapiao:rpa-external-service-consent:v1")).toBe("1");
    });

    it("removes consent when false", () => {
      localStorage.setItem("fapiao:rpa-external-service-consent:v1", "1");
      setRpaExternalServiceConsent(false);
      expect(localStorage.getItem("fapiao:rpa-external-service-consent:v1")).toBeNull();
    });
  });
});
