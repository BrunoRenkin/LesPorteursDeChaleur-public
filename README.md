# Les Porteurs de Chaleur - site code

Code of the website of *Les Porteurs de Chaleur*, a volunteer initiative where people write handwritten cards to isolated older people living in care homes.

The site runs on Wix Studio with Velo (Wix's JavaScript layer). This repository holds the code only: backend modules, page code and one stylesheet.

## 1. Problem

A volunteer who wants to write cards, or a care home that wants to receive them, has no simple way to sign up, and the organisers have no simple way to follow who is who and who writes to whom.

## 2. What it automates

1. A visitor signs up through the Wix member pop-up, and a profile record is created and linked to the account
2. The person fills in one of three forms: volunteer (F1), care home (F2) or partner (F3)
3. The form is saved in the Wix database, with consent flags for data and image
4. An internal alert e-mail goes to the organisers through a Wix automation
5. Members can edit their own profile and their organisation afterwards
6. A care home manager lists the residents who can receive cards
7. An admin back-office lets the organisers list, filter, edit and export members, organisations and residents, and create a member
8. The admin matches a volunteer with a resident by hand, and the site tracks the quota of cards each volunteer accepted
9. When a volunteer's quota is filled, the site prepares an e-mail draft in Gmail with the matched residents
10. A public page shows first name and photo of volunteers who gave image consent
11. The home page shows live counters of volunteers, institutions and residents
12. Every admin read and write is logged by field name, never by value

## 3. What stays human, and why

- **Matching** volunteers with residents stays manual. The organisers decided it, and no automatic ranking or suggestion exists
- **Sending e-mails** stays manual. The site only opens a Gmail draft. Sending to third parties through the platform is paid, and the organisers prefer to write in their own voice
- **Validation** of content and decisions stays with the organisers
- **Consent and erasure requests** are handled by the organisers by e-mail, outside the site. A consent withdrawn after an admin created the account is a case the code does not handle yet
- **Photos added by an admin** need a check by the admin that the person agreed. The site cannot verify it
- **Health information** about residents is a free-text field visible only to the organisers and the care home that entered it. It is never sent to a volunteer and never put in the e-mail draft
- **Publication** of the code to the live site is a manual click in the Wix editor, after a version check

## 4. How it is built

- Wix Studio site, with Velo code in `src/pages` (page code), `src/backend` (web methods and helpers) and `src/styles/global.css`
- Wix CMS collections for members, organisations, residents, matches, capacities and availabilities
- Wix Members for accounts and Wix Automations for the internal alert
- The Wix Git integration: this repository is the source of truth for the code, the page layout stays in the Wix editor
- ESLint with the Wix plugin, which also blocks a publication when it finds an undefined identifier

**Specified by Bruno Renkin, developed with Claude Code.** Bruno Renkin is not a software engineer. He wrote the requirements, tested each version on the live site and decided every rule. Claude Code wrote the code. Code comments are in French and record the decision behind each rule, with its date.

## 5. Measured result

Not measured yet.

## 6. Known limits and failures

- The code does not run outside Wix. The page layout, element IDs and the database schema live in the Wix editor, not in this repository
- There are no automated tests. Each change was tested by hand on the live site
- Element IDs set in the editor are fragile. Turning a section into a global section renamed its fields and broke the volunteer form in production once
- A copy-paste mistake blocked publication twice (a file pasted twice, a duplicated line). A publication also went out with the previous version several times because the editor had not yet received the new commit
- `authentication.loggedIn` was written without parentheses in 13 files. It is a function, so the test was always true and visitor redirects never ran. It was fixed in each file but remains in one leftover page copy (`ZZ - Mon Profil`) that Wix does not let the owner delete
- Hiding buttons inside a repeater row did not work in the editor. Text elements replaced them
- Wix does not recognise co-owners as admins on the published site, so access control uses a dedicated member role
- One volunteer per resident is the current rule. Two volunteers per resident is decided and not built
- Test data and pilot data are mixed in the live database, so the public counters show values that are not clean
- Git history starts on 7 October 2026, when the site was connected to GitHub. Earlier work was pasted by hand into the editor and is not in the history
- In this public copy, the Wix site, role, contact and automation identifiers are replaced by `REDACTED-...` placeholders. They must be filled in for the code to run on a Wix site

## 7. License

MIT. See [LICENSE](LICENSE).
