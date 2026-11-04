// resume-template.typ — presentation functions for tailored resumes.
// Pure functions, NO set rules here: main.typ owns page/text/list styling.
// Every user string arrives as a Typst string argument, so the TS side only
// escapes backslash and double-quote. Edit this file (not TS) to restyle.

#let doc-header(name, line1, links) = {
  let parts = (align(center, text(size: 20pt, weight: "bold", name)), v(2pt))
  if line1.len() > 0 {
    parts.push(align(center, line1.join(" | ")))
  }
  if links.len() > 0 {
    parts.push(align(center, links.map(l => link(l.at(1), l.at(0))).join(" | ")))
  }
  parts.push(v(2pt))
  parts.join()
}

#let section(title, body) = {
  (
    text(size: 12pt, weight: "bold", title),
    v(1pt),
    line(length: 100%, stroke: 0.5pt),
    v(2pt),
    body,
  ).join()
}

#let entry(title, rest, right, location, description, bullets) = {
  let parts = (text(weight: "bold", title) + rest + " " + h(1fr) + " " + right + linebreak(),)
  if location != "" {
    parts.push(emph(location) + linebreak())
  }
  if description != "" {
    parts.push(description + linebreak())
  }
  if bullets.len() > 0 {
    parts.push(list(..bullets))
  }
  parts.join()
}

#let skill-grid(rows) = {
  grid(
    columns: (auto, 1fr),
    gutter: (8pt, 4pt),
    align: (left, left),
    ..rows.map(r => (strong(r.at(0)), r.at(1))).flatten(),
  )
}

#let cert-line(name, rest, right) = {
  name + rest + " " + h(1fr) + " " + right
}
