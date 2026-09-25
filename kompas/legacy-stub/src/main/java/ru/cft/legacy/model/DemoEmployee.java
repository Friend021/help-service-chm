package ru.cft.legacy.model;

/** Демо-сотрудник заглушки. Эти поля уходят в claims токена входа. */
public class DemoEmployee {

    private String externalId;
    private String fullName;
    private String currentPosition;
    private String targetRole;
    private String careerTrack;
    private String managerFullName;
    private String managerExternalId;

    public String getExternalId() {
        return externalId;
    }

    public void setExternalId(String externalId) {
        this.externalId = externalId;
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getCurrentPosition() {
        return currentPosition;
    }

    public void setCurrentPosition(String currentPosition) {
        this.currentPosition = currentPosition;
    }

    public String getTargetRole() {
        return targetRole;
    }

    public void setTargetRole(String targetRole) {
        this.targetRole = targetRole;
    }

    public String getCareerTrack() {
        return careerTrack;
    }

    public void setCareerTrack(String careerTrack) {
        this.careerTrack = careerTrack;
    }

    public String getManagerFullName() {
        return managerFullName;
    }

    public void setManagerFullName(String managerFullName) {
        this.managerFullName = managerFullName;
    }

    public String getManagerExternalId() {
        return managerExternalId;
    }

    public void setManagerExternalId(String managerExternalId) {
        this.managerExternalId = managerExternalId;
    }
}
