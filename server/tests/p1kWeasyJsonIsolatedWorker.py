#!/usr/bin/env python3
"""ALT-09 synthetic-only JSON PDF production inside bounded Docker; no HTTP routes."""
from __future__ import annotations
import io
from pathlib import Path
import sys
import tarfile
from worker import check_boundaries
from p1kWeasyJsonTemplate import decode, render_pdf

INPUT=Path("/input")
OUTPUT=Path("/output")

def main() -> None:
    boundary=check_boundaries("details.json")
    output: dict[str,bytes] = {}
    for kind in ("details","ack"):
        path=INPUT / f"{kind}.json"
        if not path.is_file() or path.is_symlink() or not 0 < path.stat().st_size <= 512_000:
            raise RuntimeError("INVALID_JSON_INPUT")
        payload=path.read_bytes()
        doc=decode(payload)
        if kind=="details" and (len(doc["details"])!=3 or doc["hasAcknowledgements"]):
            raise RuntimeError("DETAILS_FIXTURE_MISMATCH")
        if kind=="ack" and (len(doc["details"])!=1 or len(doc["acknowledgements"])!=2 or not doc["hasAcknowledgements"]):
            raise RuntimeError("ACK_FIXTURE_MISMATCH")
        pdf=render_pdf(payload)
        with (OUTPUT / f"{kind}.pdf").open("xb") as file:
            file.write(pdf)
        output[f"{kind}.pdf"]=pdf
    output["proof.txt"]=("P1K_JSON_ISOLATED_BOUNDARY_PASS "+boundary+"\n").encode("ascii")
    # Emit validated PDF bytes and fixed proof only after both renders have succeeded.
    with tarfile.open(fileobj=sys.stdout.buffer,mode="w|") as archive:
        for name in ("proof.txt","details.pdf","ack.pdf"):
            payload=output[name]
            member=tarfile.TarInfo(name)
            member.size=len(payload)
            member.mode=0o400
            archive.addfile(member,io.BytesIO(payload))
    print("P1K_JSON_ISOLATED_WORKER_FINISHED",file=sys.stderr)

if __name__=="__main__":
    main()
