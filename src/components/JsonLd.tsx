/**
 * Server component that renders a <script type="application/ld+json"> block.
 * Use this anywhere you need to emit schema.org structured data for SEO
 * and AI search engine visibility.
 */

interface JsonLdProps {
  data: unknown;
  id?: string;
}

export default function JsonLd({ data, id }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      id={id}
      // JSON.stringify escapes </script> safely; keeping it simple.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
