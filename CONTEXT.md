# Constellation

Turns a USC STARS report into a one-page summary of a student's progress to their degree.

## Language

**STARS report**:
USC's degree progress report for one student, as a PDF or as the page open in the browser.
_Avoid_: audit, transcript

**Summary**:
The results page Constellation builds from one STARS report.
_Avoid_: dashboard, STARS summary

**Area**:
One of the groups the summary sorts requirements into: University, General education, School and major, Writing and language.
_Avoid_: category (that word belongs to GE categories A–H)

**Requirement**:
One top-level item STARS marks OK, NO or IP, such as "Total units" or "Major requirements". It can have parts.
_Avoid_: block, rule

**Part**:
A numbered sub-requirement inside a requirement, marked + or - in STARS.
_Avoid_: sub-group, sub-requirement

**Complete**:
STARS marks it OK or +.

**In progress**:
STARS marks it IP: it will be met if this term's courses pass.
_Avoid_: now, current

**Still needed**:
STARS marks it NO or -. These are the only rows the summary highlights.
_Avoid_: missing, incomplete (IN is a grade)

**Original report text**:
The report text exactly as uploaded, shown at the bottom of the summary for cross-checking.

**Redaction**:
Removing the name, student ID, diploma name and mailing address before the report is parsed. It does not apply to the original report text.

**Feedback**:
A message a student sends to the BBH team (bbh@usc.edu) from the feedback page. It never includes anything from a STARS report.

**Sample report**:
The invented Tommy Trojan report behind "Try a sample report".
_Avoid_: test report, fixture (the fixture is the older report the unit tests use)
