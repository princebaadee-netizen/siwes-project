export type ModuleChoice = "logbook" | "project" | "both";

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const WEEKDAYS: { key: Weekday; label: string; short: string }[] = [
  { key: "mon", label: "Monday", short: "Mon" },
  { key: "tue", label: "Tuesday", short: "Tue" },
  { key: "wed", label: "Wednesday", short: "Wed" },
  { key: "thu", label: "Thursday", short: "Thu" },
  { key: "fri", label: "Friday", short: "Fri" },
  { key: "sat", label: "Saturday", short: "Sat" },
  { key: "sun", label: "Sunday", short: "Sun" },
];

export interface StudentProfile {
  fullName: string;
  school: string;
  department: string;
}

export interface ITPlacement {
  companyName: string;
  companyAddress: string;
  industrySector: string;
  startDate: string; // ISO date
  endDate: string; // ISO date
  daysPerWeek: number | null;
  attendancePattern: Weekday[];
}

export interface ProjectInfo {
  title: string;
  supervisorName: string; // display only, not an account
}

export interface AppState {
  onboardingComplete: boolean;
  moduleChoice: ModuleChoice | null;
  profile: StudentProfile;
  placement: ITPlacement;
  project: ProjectInfo;
}

export const emptyState: AppState = {
  onboardingComplete: false,
  moduleChoice: null,
  profile: { fullName: "", school: "", department: "" },
  placement: {
    companyName: "",
    companyAddress: "",
    industrySector: "",
    startDate: "",
    endDate: "",
    daysPerWeek: null,
    attendancePattern: [],
  },
  project: { title: "", supervisorName: "" },
};
