# Document Automation Platform

A professional document automation platform for the Ghana School Feeding Programme (GSFP) that generates official contracts from Excel data while preserving government branding, logos, letterheads, and legal formatting.

## Features

- **Template Management**: Upload official Word templates (.docx) with government branding
- **Excel Data Processing**: Parse Excel files with caterer/recipient data
- **Document Generation**: Generate one official DOCX or PDF per spreadsheet row
- **Placeholder Mapping**: Match spreadsheet columns to document placeholders
- **Private Storage**: All templates and generated documents stored securely
- **Authentication**: Database-backed sessions with login throttling
- **Official Formatting**: Preserves logos, letterheads, tables, numbering, and signature blocks

## Tech Stack

- **Frontend**: Next.js 16.3.0 with Turbopack
- **Language**: TypeScript
- **Database**: SQLite with Prisma ORM 5.22.0
- **Document Processing**: Docxtemplater with PizZip for DOCX rendering
- **PDF Conversion**: LibreOffice headless mode
- **Authentication**: Bcrypt password hashing, HttpOnly sessions

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3 (for template authoring scripts)
- LibreOffice (for PDF conversion)

### Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Create database and run migrations
npx prisma migrate dev

# Create admin user
node scripts/create-user.mjs

# Seed the catering template
node scripts/seed-catering-template.mjs
```

### Development

```bash
# Start development server
npm run dev
```

The application will be available at `http://localhost:3000`

### Default Credentials

- **Email**: coordinator@gsfp.gov.gh
- **Password**: GSFP@2025Secure!
- **Role**: admin

## Usage

1. **Login** with your credentials
2. **Upload Template**: Upload an official Word document (.docx)
3. **Upload Excel**: Upload an Excel file with caterer/recipient data
4. **Map Fields**: Match spreadsheet columns to document placeholders
5. **Generate Documents**: Generate DOCX or PDF for each row
6. **Download**: Download generated documents securely

## Template Authoring

The platform uses Python scripts to author templates from official Word documents:

- `scripts/build-catering-template.py` - Creates templates with placeholders
- `scripts/add-regional-coordinator-signature.py` - Adds signature images

## Security

- Private file storage under `storage/` (not `public/`)
- Authenticated download endpoints
- Path traversal protection
- Login throttling (5 attempts, 15-minute lockout)
- HttpOnly session cookies
- Bcrypt password hashing

## License

This project is for the Ghana School Feeding Programme, a government agency.
