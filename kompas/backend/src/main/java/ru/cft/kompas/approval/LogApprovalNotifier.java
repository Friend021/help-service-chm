package ru.cft.kompas.approval;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Заглушка уведомления для макета: пишет в лог и формирует ссылку.
 * Реальная почта/интеграция — отдельная реализация интерфейса.
 */
public class LogApprovalNotifier implements ApprovalNotifier {

    private static final Logger log = LoggerFactory.getLogger(LogApprovalNotifier.class);

    @Override
    public void notifyManager(Long idpId, String employeeName, String managerName, String link) {
        log.info("ИПР #{} сотрудника {} направлен на согласование руководителю {}. Ссылка: {}",
                idpId, employeeName, managerName, link);
    }
}
