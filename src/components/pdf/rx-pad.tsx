/**
 * A5 prescription pad PDF.
 *
 * Identity-only by design — name, degrees, BMDC#, chambers, schedule, QR
 * to the public profile. There is NO medical-content area on this pad
 * (per CLAUDE.md constraint) — the doctor writes their prescription on
 * blank space below the chamber list, like a normal pad.
 *
 * Rendered with `@react-pdf/renderer` server-side via `renderToBuffer`.
 * Inline styles only — react-pdf doesn't support Tailwind.
 */

import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { RxPadDto } from "@/lib/rx-pad/dto";

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    padding: 24,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },

  // Header band — photo / identity / QR
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 2,
    borderBottomColor: "#0e9ba0",
    paddingBottom: 10,
    marginBottom: 12,
  },
  photo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "#0e9ba0",
    objectFit: "cover",
  },
  photoFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  identity: {
    flex: 1,
    flexDirection: "column",
    gap: 2,
  },
  name: {
    fontSize: 14,
    fontWeight: 700,
  },
  degrees: {
    fontSize: 8,
    color: "#475569",
  },
  bmdc: {
    fontSize: 8,
    marginTop: 4,
    color: "#0f172a",
  },
  specialty: {
    fontSize: 9,
    color: "#0e9ba0",
    fontWeight: 700,
  },
  qr: {
    width: 64,
    height: 64,
  },
  qrLabel: {
    fontSize: 6,
    color: "#64748b",
    textAlign: "center",
    marginTop: 2,
  },

  // Chambers
  chambersSection: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
    color: "#0e9ba0",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  chamberRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 6,
  },
  chamberBullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#0e9ba0",
    marginTop: 4,
  },
  chamberBody: {
    flex: 1,
    flexDirection: "column",
    gap: 1,
  },
  chamberName: {
    fontSize: 10,
    fontWeight: 700,
  },
  chamberMeta: {
    fontSize: 8,
    color: "#475569",
  },

  // Prescription work area — blank, doctor writes here.
  rxArea: {
    flex: 1,
    borderTopWidth: 0.5,
    borderTopColor: "#cbd5e1",
    marginTop: 8,
  },

  // Footer
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderTopWidth: 0.5,
    borderTopColor: "#cbd5e1",
    paddingTop: 6,
    fontSize: 7,
    color: "#94a3b8",
  },
  signature: {
    width: 120,
    borderTopWidth: 1,
    borderTopColor: "#0f172a",
    paddingTop: 2,
    fontSize: 7,
    color: "#475569",
    textAlign: "center",
  },
});

export function RxPad({ dto }: { dto: RxPadDto }) {
  // Truncate degrees to keep the header tidy on narrow pads — full list is
  // on the public profile (QR link).
  const degreesLine =
    dto.degrees.length > 80 ? `${dto.degrees.slice(0, 77).trim()}…` : dto.degrees;

  return (
    <Document title={`Rx pad — ${dto.displayName}`} author="Daktar.Link">
      <Page size="A5" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          {dto.photoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={dto.photoUrl} style={styles.photo} />
          ) : (
            <View style={styles.photoFallback}>
              <Text style={{ fontSize: 18, color: "#64748b", fontWeight: 700 }}>
                {dto.displayName
                  .replace(/^(Dr\.|Prof\. Dr\.|Asst\. Prof\. Dr\.|Assoc\. Prof\. Dr\.)\s+/i, "")
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.identity}>
            <Text style={styles.name}>{dto.displayName}</Text>
            {degreesLine ? <Text style={styles.degrees}>{degreesLine}</Text> : null}
            {dto.primarySpecialty ? (
              <Text style={styles.specialty}>{dto.primarySpecialty}</Text>
            ) : null}
            <Text style={styles.bmdc}>BMDC Reg. No: {dto.bmdcNumber}</Text>
          </View>
          <View>
            {/* qrDataUrl is injected by the route handler */}
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={(dto as RxPadDto & { qrDataUrl: string }).qrDataUrl} style={styles.qr} />
            <Text style={styles.qrLabel}>Daktar.Link</Text>
          </View>
        </View>

        {/* Chambers */}
        <View style={styles.chambersSection}>
          <Text style={styles.sectionTitle}>Chambers</Text>
          {dto.chambers.map((c, i) => (
            <View key={i} style={styles.chamberRow}>
              <View style={styles.chamberBullet} />
              <View style={styles.chamberBody}>
                <Text style={styles.chamberName}>{c.name}</Text>
                <Text style={styles.chamberMeta}>{c.address}</Text>
                <Text style={styles.chamberMeta}>
                  {c.schedule}
                  {c.phone ? ` · ${c.phone}` : ""}
                  {c.consultationFee ? ` · Fee ${c.consultationFee}` : ""}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Blank Rx area — doctor writes prescription here */}
        <View style={styles.rxArea} />

        {/* Footer */}
        <View style={styles.footer}>
          <View>
            <Text>Daktar.Link — verified professional identity</Text>
            <Text style={{ marginTop: 1, color: "#cbd5e1" }}>
              Identity card · Powered by Shafa Care Ltd
            </Text>
          </View>
          <Text style={styles.signature}>Signature</Text>
        </View>
      </Page>
    </Document>
  );
}
