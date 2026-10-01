Historical Import — 2025-2026 1st & 2nd (reference data)
=====================================================

Gamit: backend/import_historical.py + 4 XLSX templates dito.

1. Piliin ang template per evaluation type:
   - template_student_2025-2026.xlsx (q1..q33)
   - template_peerToPeer_2025-2026.xlsx (pr1..pr11)
   - template_hrEvaluation_2025-2026.xlsx (p1..p8)
   - template_classroomObservation_2025-2026.xlsx (d1q1..d5q6)

   Bawat template may 2 example rows na (1st + 2nd). Burahin ang examples
   bago mag-fill ng tunay na data. Huwag baguhin ang header row.

2. Fill rules (isang row = isang lumang evaluation):
   faculty_name      = eksaktong pangalan sa Faculty Management
                       (case-insensitive, pero bawal typo).
   evaluation_type   = student | peerToPeer | hrEvaluation | classroomObservation
   school_year       = 2025-2026
   semester          = 1st o 2nd (pwede rin "1st Semester")
   q1.. / p1.. etc. = 1-5 bawat isa. Kumpletuhin lahat pag detailed.
                       Pag summary lang (average lang ang meron), iwanang
                       blanko lahat ng question columns at ilagay ang
                       overall_average (hal. 4.20). Note: pag summary,
                       gagana ang weighted overall pero blanko ang
                       per-question breakdown tabs para sa row na yun.
   comments          = optional sa import (kahit required ito sa live submit).
                       classroomObservation: laging dine-drop.
   submitted_at      = YYYY-MM-DD (hal. 2025-10-15) o blanko = ngayon.
   overall_average   = gamitin LANG pag summary mode. Pag detailed, ignore
                       ito at kino-compute mula sa ratings.

3. Run (mula sa backend/, venv active):
   python import_historical.py --file import_templates\template_student_2025-2026.xlsx --dry-run --no-sentiment
   -> ayusin lahat ng ERROR rows hanggang 0 errors.

   python import_historical.py --file import_templates\template_student_2025-2026.xlsx --no-sentiment
   -> tunay na pasok. Ulitin per file.

   Pag may GPU/CPU budget at gusto ng sentiment sa old comments,
   alisin ang --no-sentiment (mabagal sa unang run, naglo-load ng XLM-R).

4. Flags:
   --dry-run                  = validate lang, walang isinusulat. Laging unahin.
   --no-sentiment             = laktawan ang XLM-R (NULL scores, mabilis).
   --no-create-terms          = mag-error pag walang term (default: auto-create as draft).
   --create-missing-faculty   = gawing Archived ang hindi mahanap na faculty
                                (default: error para iwas duplicate).
   --skip-exact-duplicates    = laktawan ang row na kaparehong-kapareho ng
                                nasa DB na (pang re-run protection).
   --generate-templates DIR   = gumawa ng templates mula sa LIVE question set
                                ng database (gamitin ito pag in-edit nyo na ang
                                questions sa Evaluation Criteria page).

5. Pagkatapos:
   - Terms mananatiling draft/closed (hindi auto-open) — makikita na sa
     Reports/Analytics via term filter (?term_id=).
   - Mag-iwan ng isang ActivityLog entry per file ("Imported historical...").
   - Kung nagkamali: walang auto-undo. Mag-restore mula sa backup o burahin
     ang term rows bago mag re-import (gamitin --skip-exact-duplicates sa re-run).

Tanong? Basahin ang docstring sa itaas ng import_historical.py.
