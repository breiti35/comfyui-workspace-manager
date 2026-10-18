import { ReactNode } from "react";
import "./settings.css";

// Settings group as an index card: mono title strip, body with the controls.
export default function SettingsSection({
  title,
  children,
  wide,
}: {
  title: string;
  children: ReactNode;
  /** span both columns in the wide layout */
  wide?: boolean;
}) {
  return (
    <section className={"lib-set-card" + (wide ? " wide" : "")}>
      <h2 className="lib-set-title">{title}</h2>
      <div className="lib-set-body">{children}</div>
    </section>
  );
}
