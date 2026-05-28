import { Section, Demo } from "./Section";
import { Panel, StatCell, Tag, Citation, Annotation, Callout, Message } from "../../components/ui";

export function ComponentsDisplaySection() {
  return (
    <Section title="Components · display" note="Containers and read-only display primitives.">
      <div className="grid gap-4 md:grid-cols-2">
        <Demo label="Panel">
          <Panel title="Course MOC" headerRight="3 milestones">Panel body content sits here.</Panel>
        </Demo>
        <Demo label="StatCell">
          <div className="grid grid-cols-2 gap-3">
            <StatCell label="Streak" value={12} unit="d" trend="up" />
            <StatCell label="Due today" value={34} trend="flat" />
          </div>
        </Demo>
        <Demo label="Tag">
          <div className="flex flex-wrap gap-2">
            <Tag>brand</Tag>
            <Tag tone="neutral">neutral</Tag>
            <Tag tone="success">success</Tag>
            <Tag tone="warn">warn</Tag>
            <Tag tone="danger">danger</Tag>
          </div>
        </Demo>
        <Demo label="Citation">
          <div className="flex flex-col gap-1">
            <Citation source="Spivak, Calculus" locator="p.42" href="#spivak" />
            <Citation source="Lecture 3" locator="12:30" />
          </div>
        </Demo>
        <Demo label="Annotation">
          <p className="text-sm text-text">
            Inline text with <Annotation label="aside">a de-emphasized margin note</Annotation>.
          </p>
        </Demo>
        <Demo label="Callout">
          <div className="flex flex-col gap-2">
            <Callout variant="note" title="Note">A standard informational callout.</Callout>
            <Callout variant="ai" title="AI">Cyan is reserved for AI output.</Callout>
          </div>
        </Demo>
        <Demo label="Message">
          <div className="flex flex-col gap-3">
            <Message role="user" author="You">How do I derive this?</Message>
            <Message role="ai" author="Tutor">Let's start from the definition — what do you recall?</Message>
          </div>
        </Demo>
      </div>
    </Section>
  );
}
