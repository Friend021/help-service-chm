package ru.cft.kompas.approval;

/** Уведомление руководителя о направлении ИПР на согласование. */
public interface ApprovalNotifier {

    void notifyManager(Long idpId, String employeeName, String managerName, String link);
}
