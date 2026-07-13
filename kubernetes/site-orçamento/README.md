# Site Orçamentos

Simple, functional internal tool for generating commercial proposals (propostas comerciais) for TAUBE EQUIPAMENTOS. The user fills in the proposal data through a web interface, Claude AI enriches the text, and the app generates a formatted `.docx` file ready to send to clients.

There is no database — generated proposals are saved directly to the Nextcloud server for access by company users.

Source code is hosted on Forgejo at `192.168.1.191:3000`.

## Stack

| Component | Details |
|-----------|---------|
| Frontend | React 19 + Vite |
| Backend | Python FastAPI |
| AI | Claude API (Anthropic) — enriches proposal text |
| Output | `.docx` generated from templates via `python-docx` |
| Kubernetes namespace | `site-orcamentos` |
| External IP | `192.168.1.194` (MetalLB LoadBalancer) |

## How it works

1. User fills in the proposal form (client name, items, specs)
2. Frontend sends data to the FastAPI backend
3. Backend sends the data to Claude API with a system prompt
4. Claude returns enriched professional text in JSON
5. Backend merges the text into a `.docx` template
6. User downloads the ready-to-send proposal

## Sensitive files

The following are **git-crypt encrypted** in this repo:

| File/Path | Reason |
|-----------|--------|
| `api/.env` | Anthropic API key |
| `assets/*` | Company logos and images |
| `models/*.docx` | Proposal templates and real client proposals |

## Structure

```
site-orcamentos/
├── api/              ← FastAPI backend
│   ├── main.py       ← API endpoints + Claude integration
│   ├── builder.py    ← docx generation logic
│   ├── Dockerfile
│   └── requirements.txt
├── src/              ← React frontend
│   ├── App.jsx
│   ├── proposalData.js
│   └── styles.css
├── models/           ← docx templates (git-crypt encrypted)
├── assets/           ← company images (git-crypt encrypted)
├── Dockerfile        ← frontend image
├── nginx.conf        ← nginx config for frontend container
└── package.json
```
