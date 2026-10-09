import { AppState, ModuleChoice, Weekday } from "./types";

const backendToModule: Record<string, ModuleChoice> = {
  LOGBOOK: "logbook",
  PROJECT: "project",
  BOTH: "both",
};

function toDateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

/**
 * Rebuilds the cached app state from the server record. After a login on a
 * fresh browser there is nothing in localStorage, and the dashboard renders
 * entirely from this cache — without this, a returning student sees an empty
 * dashboard even though their data is intact on the server.
 */
export function applyProfile(state: AppState, profile: any): AppState {
  if (!profile) return state;

  const placement = profile.itPlacement;
  const project = Array.isArray(profile.projects) ? profile.projects[0] : null;

  return {
    ...state,
    onboardingComplete: true,
    moduleChoice: profile.moduleChoice
      ? backendToModule[profile.moduleChoice] ?? state.moduleChoice
      : state.moduleChoice,
    profile: {
      fullName: profile.fullName || state.profile.fullName,
      school: profile.school || state.profile.school,
      department: profile.department || state.profile.department,
    },
    placement: placement
      ? {
          companyName: placement.companyName || "",
          companyAddress: placement.companyAddress || "",
          industrySector: placement.industrySector || "",
          startDate: toDateInput(placement.startDate),
          endDate: toDateInput(placement.endDate),
          daysPerWeek: placement.daysPerWeek ?? null,
          attendancePattern: (placement.attendancePattern ?? []) as Weekday[],
        }
      : state.placement,
    project: project
      ? {
          title: project.title || "",
          supervisorName: project.supervisorName || "",
        }
      : state.project,
  };
}
