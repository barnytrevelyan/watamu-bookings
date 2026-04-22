import type { Metadata } from 'next';
import SurveyForm from '../SurveyForm';
import { hostSurvey } from './definition';

export const metadata: Metadata = {
  title: 'Kwetu host questionnaire',
  description:
    'Help shape a Kenya-first short-let booking platform designed for hosts. 10-15 minutes.',
  robots: { index: false, follow: false },
};

export default function HostSurveyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50/60 via-white to-white">
      <SurveyForm def={hostSurvey} />
    </div>
  );
}
