// Isolated C1 scheduling predicates. Withdrawn windows are conservative explicit blocks.
export const appointmentConflictSql=`NOT EXISTS(SELECT 1 FROM consultation_availability_windows w WHERE w.practitioner_id=? AND w.state='Withdrawn' AND w.start_at<? AND w.end_at>?) AND NOT EXISTS(SELECT 1 FROM consultation_slot_reservations r WHERE r.practitioner_id=? AND r.state IN ('Held','Confirmed') AND r.start_at<? AND r.end_at>?) AND NOT EXISTS(SELECT 1 FROM consultation_workflow_appointments r WHERE r.practitioner_id=? AND r.state='Active' AND r.start_at<? AND r.end_at>?)`;
export const appointmentConflictValues=(practitioner,start,end)=>[practitioner,end,start,practitioner,end,start,practitioner,end,start];
export function appointmentError(code){const error=Error('Consultation appointment unavailable');error.code=code;return error;}
export const appointmentErrorCodes=new Set(['APPOINTMENT_UNAVAILABLE','OFFER_CHANGED_OR_EXPIRED']);
