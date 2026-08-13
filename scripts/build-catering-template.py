#!/usr/bin/env python3
"""Author the GSFP catering contract .docx template.

Takes the agency's original contract and replaces each fill-in blank with a
{{placeholder}} understood by docxtemplater, leaving every handwritten
signature line, the coat of arms, the cover page table and all clause
formatting untouched.

Signature lines (the dotted rules people physically sign on) are deliberately
preserved as dotted lines.

Usage: python3 scripts/build-catering-template.py <source.docx> <output.docx>
"""
import re
import shutil
import sys
import zipfile
from xml.etree import ElementTree as ET

GSFP_ADDRESS = "P. O. Box 1627, State House, Accra"
GSFP_TEL = "0302-681861 / 681863"
GSFP_EMAIL = " ghanaschoolfeeding@yahoo.com"

# National Coordinator witness block details
NC_COORDINATOR = "National Coordinator"
NC_ADDRESS = "P.O.BOX 1627"
NC_TEL = "0244206116"

# Clause 1.1 term of the contract. Identical on every contract in the cycle, so
# it is fixed here instead of being asked for once per batch.
# NOTE: the agency's copy reads "THRID TERM"; corrected to "THIRD" here rather
# than printing the typo onto every signed contract. Revert if they want it
# reproduced verbatim.
CONTRACT_START = "6TH MAY 2025"
CONTRACT_END = "END OF THIRD TERM OF 2028/2029 ACADEMIC YEAR"

# Maps the index of a <w:t> text node in word/document.xml to its new content.
# Indices 212-245 appear twice because Word stores the signature text boxes as
# mc:AlternateContent (a Choice and a Fallback copy); both must be replaced or
# Word may render the stale copy.
REPLACEMENTS = {
    7: "{{caterer_name}}",                              # cover page party name
    12: "CONTRACT NO: {{contract_number}}",
    13: "",                                             # remove "THIS CONTRACT is made this "
    14: "",                                             # remove dotted day
    15: "",                                             # remove " day of "
    16: "",                                             # remove dotted month
    17: "",                                             # remove separator
    18: "",                                             # remove dotted year
    19: "",                                             # remove dotted year
    # The source document reads 'AND' / 'I…………' — the stray "I" would render as
    # "IAdjoa Mensah Catering Services". Removed so the parties clause reads
    # correctly; confirm with the agency's legal team.
    23: "",
    24: "{{caterer_name}}",                             # parties clause
    25: "",
    28: "{{district}}",                                 # "located within ..."
    29: "",
    31: "{{region}}",
    44: "{{school_name}}",                              # "provision of meals at"
    45: "",
    47: "{{school_location}}",                          # ", located at ..."
    48: "",
    # Clause 1.1 is the same on every contract in a cycle: the agency writes one
    # commencement date and one expiry for the whole batch, so these are static
    # text rather than mapped fields. Update them here when the cycle changes.
    60: (
        "The term of this Contract is for a period of Forty-eight (48) months "
        "from the Contract Date, commencing on "
    ),
    61: CONTRACT_START,
    62: " and expiring on ",
    63: CONTRACT_END,
    64: "",
    65: ".",
    # GSFP signature block (both text box copies) - DO NOT REPLACE these indices
    # They are part of the witness section that includes "IN WITNESS WHEREOF"
    # at index 209. Replacing them would remove the witness statement.
    # Caterer signature block (both copies). 234/235 and 240/241 stay dotted.
    # The caterer's address and telephone (238/239, 244/245) keep the original
    # dotted rules: those details are not in the district returns, and are
    # written in by hand at signing along with the signature.
    236: "Name of Caterer: {{caterer_name}}",
    237: "",
    242: "Name of Caterer: {{caterer_name}}",
    243: "",
    # Remove duplicate "Witnessed by" at index 247 (the one without space)
    247: "",  # Remove "Witnessed by" (without space)
    # National Coordinator witness block - replace dotted lines with actual contact details
    # These are the witness block dotted lines at the end of the document (indices 254-264)
    # This is the SECOND witness block at the end of the document
    254: NC_COORDINATOR,  # Changed from Regional Coordinator
    255: "",  # Remove "Coordina" (part of split word)
    256: "",  # Remove "tor" (part of split word)
    257: "",  # Remove "Address"
    258: "",  # Remove ": "
    259: NC_ADDRESS,  # Replace dotted address with actual address
    260: "",  # Remove dotted line after address
    261: "",  # Remove "Tel"
    262: NC_TEL,  # Replace dotted telephone with actual telephone
    263: "",  # Remove "Email:"
    264: "",  # Remove dotted email line
}

# Text nodes that must remain dotted lines because they are completed by hand:
# the signature rules, the caterer's address and telephone.
SIGNATURE_LINES = {
    212, 223, 234, 235, 238, 239, 240, 241, 244, 245, 248, 251, 252, 253,
    # 247 is now removed (duplicate "Witnessed by")
    # 259 and 262 are now filled with actual address and telephone
    # 257, 258, 260, 261, 263, 264 removed - no longer dotted
}


def escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


ANCHOR = re.compile(r"<wp:anchor\b.*?</wp:anchor>", re.S)


def inline_pictures(document: str) -> tuple[str, int]:
    """Pins the coat of arms into the text flow.

    The agency's original holds the logo as a floating anchor: dragged to a
    fixed offset from a paragraph, with <wp:wrapNone/> so text does not flow
    around it. Filling a placeholder changes the height of the text above it,
    the anchor paragraph moves, and the logo drifts across the letterhead and
    overlaps it.

    Rewriting the anchor as <wp:inline> puts the image in the flow of its own
    centred paragraph, so it always sits above 'REPUBLIC OF GHANA' no matter
    how long the caterer's name is. The signature text boxes are left floating
    on purpose: they are positioned side by side and do not overlap text.
    """
    converted = 0

    def convert(match: re.Match) -> str:
        nonlocal converted
        block = match.group(0)
        if "<pic:pic" not in block:
            return block  # a text box, not a picture: leave it floating

        def grab(pattern: str) -> str | None:
            found = re.search(pattern, block, re.S)
            return found.group(0) if found else None

        extent = grab(r"<wp:extent\b[^>]*/>")
        graphic = grab(r"<a:graphic\b.*?</a:graphic>")
        if not extent or not graphic:
            return block  # unrecognised shape, safer to leave alone

        parts = ['<wp:inline distT="0" distB="0" distL="0" distR="0">', extent]
        for pattern in (
            r"<wp:effectExtent\b[^>]*/>",
            r"<wp:docPr\b[^>]*/>|<wp:docPr\b.*?</wp:docPr>",
            r"<wp:cNvGraphicFramePr\b[^>]*/>|<wp:cNvGraphicFramePr\b.*?</wp:cNvGraphicFramePr>",
        ):
            piece = grab(pattern)
            if piece:
                parts.append(piece)
        parts.append(graphic)
        parts.append("</wp:inline>")
        converted += 1
        return "".join(parts)

    return ANCHOR.sub(convert, document), converted


def build(source: str, output: str) -> None:
    with zipfile.ZipFile(source) as zf:
        document = zf.read("word/document.xml").decode("utf-8")

    pattern = re.compile(r"(<w:t(?: [^>]*)?>)([^<]*)(</w:t>)")
    index = 0
    applied = []

    def substitute(match: re.Match) -> str:
        nonlocal index
        current = index
        index += 1
        if current not in REPLACEMENTS:
            return match.group(0)
        replacement = REPLACEMENTS[current]
        applied.append(current)
        # xml:space="preserve" keeps leading/trailing spaces from collapsing.
        open_tag = match.group(1)
        if 'xml:space' not in open_tag:
            open_tag = open_tag[:-1] + ' xml:space="preserve">'
        return f"{open_tag}{escape(replacement)}{match.group(3)}"

    updated = pattern.sub(substitute, document)

    missing = sorted(set(REPLACEMENTS) - set(applied))
    if missing:
        raise SystemExit(f"Text nodes not found, source document changed: {missing}")

    # Check if IN WITNESS WHEREOF is still present after text substitution
    if 'IN WITNESS WHEREOF' in document and 'IN WITNESS WHEREOF' not in updated:
        print("WARNING: IN WITNESS WHEREOF was removed during text substitution")
        print("This should not happen since none of the REPLACEMENTS indices are in the witness section")

    # Runs after the text substitution so the <w:t> indices above still line up
    # with the agency's original; the logo block holds no text nodes.
    updated, inlined = inline_pictures(updated)

    # DISABLED: Duplicate removal - not working as expected
    # updated = re.sub(
    #     r'<w:p[^>]*><w:pPr[^>]*>.*?</w:pPr><w:r[^>]*><w:rPr[^>]*>.*?</w:rPr><w:t[^>]*>Witnessed by</w:t></w:r></w:p>',
    #     '',
    #     updated,
    #     count=1
    # )
    
    # TEMPORARILY DISABLED: Reduce spacing in National Coordinator section to fit on one page
    # This is causing issues with the witness section
    # nc_pos = updated.find('National Coordinator')
    # if nc_pos >= 0:
    #     # Find all paragraph properties in the witness block and reduce spacing
    #     updated = re.sub(
    #         r'(<w:pPr[^>]*><w:spacing w:after=")0(")',
    #         r'\g<1>60\g<2>',
    #         updated
    #     )
    #     # Also reduce line spacing in the witness block
    #     updated = re.sub(
    #         r'(<w:pPr[^>]*><w:spacing[^>]*w:line=")360(")',
    #         r'\g<1>240\g<2>',
    #         updated
    #     )
    
    # Add "IN WITNESS WHEREOF" before the witness block if not present
    # DISABLED: This is adding it in the wrong place and removing the original
    # if 'IN WITNESS WHEREOF' not in updated:
    #     # Find the first "Witnessed by" and add the witness statement before it
    #     witnessed_pos = updated.find('Witnessed by')
    #     if witnessed_pos >= 0:
    #         # Find the paragraph start
    #         para_start = updated.rfind('<w:p', 0, witnessed_pos)
    #         if para_start >= 0:
    #             witness_statement = '<w:p><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="Calibri" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="Calibri" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">IN WITNESS WHEREOF THE PARTIES HERETO HAVE SET THEIR COMMON SEALS AND HANDS ON THE DAY AND YEAR ABOVE WRITTEN</w:t></w:r></w:p>'
    #             updated = updated[:para_start] + witness_statement + updated[para_start:]

    # Rewrite the single changed part, preserving every other file in the docx
    # (images, styles, numbering, theme, docProps) byte for byte.
    with zipfile.ZipFile(source) as src, zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as dst:
        for item in src.infolist():
            data = src.read(item.filename)
            if item.filename == "word/document.xml":
                data = updated.encode("utf-8")
            dst.writestr(item, data)

    placeholders = sorted(set(re.findall(r"\{\{([^}]+)\}\}", updated)))
    print(f"Replaced {len(applied)} text nodes")
    print(f"Preserved {len(SIGNATURE_LINES)} handwritten signature lines")
    print(f"Anchored {inlined} floating picture(s) into the text flow")
    print(f"Placeholders: {placeholders}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    build(sys.argv[1], sys.argv[2])
