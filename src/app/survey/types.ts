// Shared type definitions for the discovery questionnaires.
//
// The two surveys (host + guest) are rendered by a single form
// component driven by this definition shape. Keep field kinds tight
// so we only need one rendering switch — if a question genuinely needs
// a new UI (e.g. ranking, drag-and-drop) add a new kind rather than
// overloading `longtext`.

export type FieldKind =
  | 'text'
  | 'longtext'
  | 'email'
  | 'phone'
  | 'number'
  | 'radio'
  | 'checkbox'
  | 'scale'     // 1-5 Likert
  | 'slider';   // numeric slider (commission %, price expectation, etc.)

export interface FieldOption {
  value: string;
  label: string;
  /** If true, selecting this option reveals a free-text "please specify" box. */
  allowOther?: boolean;
}

export interface FieldDef {
  id: string;
  kind: FieldKind;
  label: string;
  /** Smaller grey helper line underneath the question. */
  help?: string;
  required?: boolean;
  placeholder?: string;
  options?: FieldOption[];
  /** For slider / number kinds. */
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** For scale kind — labels to pin at the extremes. */
  scaleLow?: string;
  scaleHigh?: string;
  /** For text / longtext kinds — character cap. */
  maxLength?: number;
}

export interface SurveySection {
  id: string;
  title: string;
  intro?: string;
  fields: FieldDef[];
}

export interface SurveyDefinition {
  audience: 'host' | 'guest';
  title: string;
  subtitle: string;
  intro: string;
  /** Shown under the title as a plain byline, not a link. */
  byline?: string;
  sections: SurveySection[];
  /** Optional thank-you note shown after submission. */
  thankYou: {
    title: string;
    body: string;
  };
}

/** Runtime answer map. Values are deliberately permissive. */
export type AnswerValue = string | string[] | number | null;
export type AnswerMap = Record<string, AnswerValue>;
