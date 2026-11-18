# PGNT ASIAN TOPUP — Owner Sample Candidate Register (2026-11-18)

## Purpose and safety

This register proposes one **candidate** fixed-value Airtime product for each standard mobile operator, to make owner review faster. These are selected from the uploaded offline master workbook only. They are **not approved samples**, not live DT One verification, and not permission to import or activate anything.

The owner must approve one sample for each operator in the Admin Panel. The backend must then obtain and verify the exact provider product/operator identity from DT One. Keep every candidate disabled until separately approved for activation.

Selection rule: standard Mobile operator only (excluding eSIM and Postpaid labels); fixed-value recharge; Airtime subservice; integer destination denomination from 75 through 3,000 inclusive; prefer denomination nearest 100 in local currency. Where no Airtime candidate exists, use an eligible fixed recharge candidate from another subservice. No rounding is performed.

## Candidate register

| Country | Operator | Candidate Product ID | Workbook product name | Amount |
|---|---|---:|---|---:|
| Afghanistan | ATOMA Afghanistan | 7191 | 100 AFN | 100 AFN |
| Afghanistan | Afghan Wireless Afghanistan | 10531 | Afghan Wireless Afghanistan 100 AFN | 100 AFN |
| Afghanistan | Etisalat Afghanistan | 6478 | Etisalat Afghanistan 100 AFN | 100 AFN |
| Afghanistan | Roshan Afghanistan | 6149 | Roshan Afghanistan 100 AFN | 100 AFN |
| Afghanistan | Salaam Afghanistan | 23130 | Salaam Afghanistan 100 AFN | 100 AFN |
| Bangladesh | Airtel Bangladesh | 3471 | Airtel Bangladesh 100 BDT | 100 BDT |
| Bangladesh | Banglalink Bangladesh | 3433 | Banglalink Bangladesh 100 BDT | 100 BDT |
| Bangladesh | GrameenPhone Bangladesh | 3429 | GrameenPhone Bangladesh 100 BDT | 100 BDT |
| Bangladesh | Robi Bangladesh | 3425 | Robi Bangladesh 100 BDT | 100 BDT |
| Bangladesh | Teletalk Bangladesh | 3467 | Teletalk Bangladesh 100 BDT | 100 BDT |
| India | Airtel India | 60707 | Topup Plan - 120 INR | 120 INR |
| India | BSNL India | 3445 | BSNL India - Topup Plan - 100 INR | 100 INR |
| India | Reliance Jio India | 29732 | Reliance Jio India - Topup Plan INR 1000 | 1,000 INR |
| Pakistan | Jazz Pakistan | 3760 | 100 PKR | 100 PKR |
| Pakistan | Telenor Pakistan | 3378 | Telenor Pakistan 100 PKR | 100 PKR |
| Pakistan | Ufone Pakistan | 2788 | 100 PKR | 100 PKR |
| Pakistan | Zong Pakistan | 3923 | 100 PKR | 100 PKR |

## Classification boundaries

- 17 standard mobile operator labels are represented above: Afghanistan 5, Bangladesh 5, India 3, Pakistan 4.
- The workbook also contains 3 Pakistan Postpaid labels; these are separate service variants and are not included as standard mobile operators in this sample register.
- eSIM rows and India DTH/Television utility rows are excluded from this mobile Airtime sample list.
- This workbook does not establish the exact DT One provider operator IDs. A matching display name is not sufficient; exact provider identity must be confirmed through the provider response.
- The candidate Product IDs and prices are workbook data only. No live provider request was made for this register.

## Next controlled steps

1. Owner reviews and approves or replaces each proposed sample in the Admin Panel.
2. For each approved sample, verify exact Product ID, country, provider operator ID, currency, product type, denomination and EUR wholesale/retail prices against DT One.
3. Automatically verify other eligible products only against that approved sample's exact provider operator ID.
4. Keep failures, identity mismatches, unsupported product types and missing price evidence in review.
5. Activation remains a separate owner-controlled action after verification.
