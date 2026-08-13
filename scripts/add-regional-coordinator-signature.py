#!/usr/bin/env python3
"""Add the National Coordinator signature image to the catering contract template.

The signature image is placed above the dotted line in the National Coordinator
witness block, so the image appears on every generated contract while the dotted
line remains for physical signing if needed.

Usage: python3 scripts/add-regional-coordinator-signature.py <template.docx> <output.docx>
"""
import re
import shutil
import sys
import zipfile
from xml.etree import ElementTree as ET

# Path to the signature image (relative to project root)
SIGNATURE_IMAGE = "storage/signature-regional-coordinator.png"


def add_signature_to_document(
    document_xml: str, signature_rel_id: str, image_width: int, image_height: int
) -> str:
    """Insert the signature image paragraph after the 'Witnessed by ' paragraph.

    The image is placed as a left-aligned paragraph with the signature.
    Only adds the signature once to avoid duplicates.
    """
    # Find the paragraph containing "Witnessed by " (with trailing space)
    # and insert the signature image paragraph immediately after it
    # Only match the first occurrence to avoid duplicates
    pattern = re.compile(
        r'(<w:p[^>]*>.*?<w:t[^>]*>Witnessed by </w:t>.*?</w:p>)',
        re.DOTALL
    )

    image_paragraph = f"""<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{image_width}" cy="{image_height}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Signature"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="Signature"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="{signature_rel_id}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{image_width}" cy="{image_height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>"""

    def insert_after(match: re.Match) -> str:
        return match.group(0) + image_paragraph

    # Only replace the first occurrence to avoid duplicates
    return pattern.sub(insert_after, document_xml, count=1)


def build(source: str, output: str) -> None:
    # Read the signature image
    try:
        with open(SIGNATURE_IMAGE, "rb") as f:
            signature_data = f.read()
    except FileNotFoundError:
        raise SystemExit(f"Signature image not found: {SIGNATURE_IMAGE}")

    # Open the source template
    with zipfile.ZipFile(source) as zf:
        document = zf.read("word/document.xml").decode("utf-8")
        # Read existing relationships to find the next available ID
        try:
            rels = zf.read("word/_rels/document.xml.rels").decode("utf-8")
        except KeyError:
            rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'

    # Add the signature image to the media folder
    signature_filename = "signature-regional-coordinator.png"
    signature_media_path = f"word/media/{signature_filename}"

    # Parse relationships to find the next ID and check if signature already exists
    rels_root = ET.fromstring(rels)
    rels_ns = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
    existing_ids = []
    signature_rel_id = None

    for rel in rels_root.findall("r:Relationship", rels_ns):
        rel_id = rel.get("Id")
        rel_target = rel.get("Target", "")
        if rel_id and rel_id.startswith("rId"):
            try:
                existing_ids.append(int(rel_id[3:]))
            except ValueError:
                pass
        # Check if a relationship for the signature image already exists
        if rel_target == f"media/{signature_filename}":
            signature_rel_id = rel_id

    if not signature_rel_id:
        # No existing relationship, create a new one
        next_id = max(existing_ids) + 1 if existing_ids else 1
        signature_rel_id = f"rId{next_id}"

    # Add the signature image to the media folder
    signature_filename = "signature-regional-coordinator.png"
    signature_media_path = f"word/media/{signature_filename}"

    # Check if the signature image already exists in the template
    signature_already_exists = False
    with zipfile.ZipFile(source) as src:
        for item in src.infolist():
            if item.filename == signature_media_path:
                signature_already_exists = True
                break

    # Update the document XML to insert the signature
    # Image dimensions in EMUs (1 inch = 914400 EMUs)
    # 180px width ≈ 1.8 inches at 100dpi ≈ 1714500 EMUs (even smaller)
    # 75px height ≈ 0.75 inches at 100dpi ≈ 714375 EMUs (even smaller)
    image_width_emu = 1714500
    image_height_emu = 714375

    updated_document = add_signature_to_document(
        document, signature_rel_id, image_width_emu, image_height_emu
    )

    # Check if the signature image already exists in the template
    signature_already_exists = False
    with zipfile.ZipFile(source) as src:
        for item in src.infolist():
            if item.filename == signature_media_path:
                signature_already_exists = True
                break

    # Add the relationship for the image only if it doesn't already exist
    if not any(
        rel.get("Target") == f"media/{signature_filename}"
        for rel in rels_root.findall("r:Relationship", rels_ns)
    ):
        new_rel = ET.Element(
            f"{{{rels_ns['r']}}}Relationship",
            {
                "Id": signature_rel_id,
                "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
                "Target": f"media/{signature_filename}",
            },
        )
        rels_root.append(new_rel)
    # Serialize without namespace prefix to match original format
    updated_rels = ET.tostring(rels_root, encoding="utf-8", xml_declaration=True)
    # Remove the namespace prefix from the output and fix encoding declaration
    updated_rels = updated_rels.replace(b'xmlns:ns0=', b'xmlns=').replace(b'<ns0:', b'<').replace(b'</ns0:', b'</').replace(b"encoding='utf-8'", b"encoding='UTF-8'")

    # Write the output
    with zipfile.ZipFile(source) as src, zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as dst:
        for item in src.infolist():
            data = src.read(item.filename)
            if item.filename == "word/document.xml":
                data = updated_document.encode("utf-8")
            elif item.filename == "word/_rels/document.xml.rels":
                data = updated_rels
            elif item.filename == signature_media_path:
                # Skip the existing signature image, we'll add it fresh
                continue
            elif item.filename == "[Content_Types].xml":
                # Ensure PNG content type is declared
                content_types_str = data.decode('utf-8')
                if '<Default Extension="png"' not in content_types_str:
                    content_types_str = content_types_str.replace(
                        '</Types>',
                        '<Default Extension="png" ContentType="image/png"/></Types>'
                    )
                    data = content_types_str.encode('utf-8')
            dst.writestr(item, data)

        # Add the signature image to the media folder
        dst.writestr(signature_media_path, signature_data)

    print(f"Added signature image at Regional Coordinator witness block")
    print(f"Signature relationship ID: {signature_rel_id}")
    print(f"Image path in docx: {signature_media_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    build(sys.argv[1], sys.argv[2])
