import type { Metadata } from 'next';
import SurveyForm from '../SurveyForm';
import { guestSurvey } from './definition';

export const metadata: Metadata = {
  title: 'Kwetu guest questionnaire',
  description:
    'Help shape a Kenya-first booking platform for coastal stays. About 8 minutes.',
  robots: { index: false, follow: false },
};

export default function GuestSurveyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/60 via-white to-white">
      <SurveyForm def={guestSurvey} />
    </div>
  );
}
