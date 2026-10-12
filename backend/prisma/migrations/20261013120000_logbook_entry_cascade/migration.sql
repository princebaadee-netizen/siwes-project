-- Rebuilding a placement's attendance calendar deletes the days that no longer
-- match the pattern. Those days can carry a logbook entry, and the original
-- ON DELETE RESTRICT made the delete fail (P2003 -> 500) once a student had
-- logged any day. Cascade the delete to the entry so a placement edit works.
ALTER TABLE "logbook_entries" DROP CONSTRAINT "logbook_entries_calendarDayId_fkey";
ALTER TABLE "logbook_entries" ADD CONSTRAINT "logbook_entries_calendarDayId_fkey" FOREIGN KEY ("calendarDayId") REFERENCES "attendance_calendar_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;
