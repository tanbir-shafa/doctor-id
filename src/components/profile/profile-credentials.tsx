import {Award, BookOpen, Medal} from "lucide-react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import type {DoctorDocLike} from "@/types/doctor";

/**
 * Loop A — status-signaling block. Renders awards, memberships, and
 * publications when the doctor has any of them. The whole block returns
 * null when all three are empty so the public profile doesn't show an
 * empty card.
 */
export function ProfileCredentials({doctor}: {doctor: DoctorDocLike}) {
    const awards = doctor.awards ?? [];
    const memberships = doctor.memberships ?? [];
    const publications = doctor.publications ?? [];
    if (awards.length === 0 && memberships.length === 0 && publications.length === 0) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Medal className="size-5 text-primary" aria-hidden="true" />
                    Credentials
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
                {awards.length > 0 ? (
                    <section>
                        <h3 className="mb-2 flex items-center gap-1.5 font-medium text-foreground">
                            <Award className="size-4 text-primary" aria-hidden="true" />
                            Awards
                        </h3>
                        <ul className="space-y-1 pl-1">
                            {awards.map((a, i) => (
                                <li key={i} className="text-foreground/90">
                                    <span className="font-medium">{a.title}</span>
                                    {a.issuer ? <span className="text-muted-foreground"> — {a.issuer}</span> : null}
                                    {typeof a.year === "number" ? (
                                        <span className="text-muted-foreground"> ({a.year})</span>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {memberships.length > 0 ? (
                    <section>
                        <h3 className="mb-2 font-medium text-foreground">Memberships</h3>
                        <ul className="flex flex-wrap gap-2">
                            {memberships.map((m, i) => (
                                <li
                                    key={i}
                                    className="rounded-full bg-muted px-3 py-1 text-foreground/90"
                                >
                                    {m.body}
                                    {m.role ? (
                                        <span className="text-muted-foreground"> · {m.role}</span>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {publications.length > 0 ? (
                    <section>
                        <h3 className="mb-2 flex items-center gap-1.5 font-medium text-foreground">
                            <BookOpen className="size-4 text-primary" aria-hidden="true" />
                            Publications
                        </h3>
                        <ul className="space-y-2">
                            {publications.map((p, i) => (
                                <li key={i}>
                                    {p.url ? (
                                        <a
                                            href={p.url}
                                            target="_blank"
                                            rel="noreferrer noopener"
                                            className="font-medium text-primary hover:underline"
                                        >
                                            {p.title}
                                        </a>
                                    ) : (
                                        <span className="font-medium text-foreground">{p.title}</span>
                                    )}
                                    {p.journal ? (
                                        <span className="text-muted-foreground"> — {p.journal}</span>
                                    ) : null}
                                    {typeof p.year === "number" ? (
                                        <span className="text-muted-foreground"> ({p.year})</span>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}
            </CardContent>
        </Card>
    );
}
