"use client";

import {useState, useTransition} from "react";
import {Plus, Trash2} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {updateProfileCredentialsAction} from "@/server/actions/doctor";
import type {DoctorAward, DoctorMembership, DoctorPublication} from "@/types/doctor";

type SubmitResult = {ok: true} | {ok: false; error: string};
type SubmitAction = (form: FormData) => Promise<SubmitResult>;

type AwardRow = {title: string; issuer: string; year: string};
type MembershipRow = {body: string; role: string; since: string};
type PublicationRow = {title: string; journal: string; year: string; url: string};

const CURRENT_YEAR = new Date().getFullYear();

export function CredentialsEditor({
    initial,
    submitAction,
}: {
    initial: {
        awards?: DoctorAward[];
        memberships?: DoctorMembership[];
        publications?: DoctorPublication[];
    };
    submitAction?: SubmitAction;
}) {
    const [awards, setAwards] = useState<AwardRow[]>(() =>
        (initial.awards ?? []).map((a) => ({
            title: a.title,
            issuer: a.issuer ?? "",
            year: a.year != null ? String(a.year) : "",
        })),
    );
    const [memberships, setMemberships] = useState<MembershipRow[]>(() =>
        (initial.memberships ?? []).map((m) => ({
            body: m.body,
            role: m.role ?? "",
            since: m.since != null ? String(m.since) : "",
        })),
    );
    const [publications, setPublications] = useState<PublicationRow[]>(() =>
        (initial.publications ?? []).map((p) => ({
            title: p.title,
            journal: p.journal ?? "",
            year: p.year != null ? String(p.year) : "",
            url: p.url ?? "",
        })),
    );
    const [pending, startTransition] = useTransition();
    const [msg, setMsg] = useState<{tone: "ok" | "err"; text: string} | null>(null);

    function save() {
        setMsg(null);
        const awardsPayload = awards
            .filter((a) => a.title.trim().length > 0)
            .map((a) => ({
                title: a.title.trim(),
                issuer: a.issuer.trim() || undefined,
                year: a.year ? Number(a.year) : undefined,
            }));
        const membershipsPayload = memberships
            .filter((m) => m.body.trim().length > 0)
            .map((m) => ({
                body: m.body.trim(),
                role: m.role.trim() || undefined,
                since: m.since ? Number(m.since) : undefined,
            }));
        const publicationsPayload = publications
            .filter((p) => p.title.trim().length > 0)
            .map((p) => ({
                title: p.title.trim(),
                journal: p.journal.trim() || undefined,
                year: p.year ? Number(p.year) : undefined,
                url: p.url.trim() || undefined,
            }));

        startTransition(async () => {
            const fd = new FormData();
            fd.set("awards", JSON.stringify(awardsPayload));
            fd.set("memberships", JSON.stringify(membershipsPayload));
            fd.set("publications", JSON.stringify(publicationsPayload));
            const action = submitAction ?? updateProfileCredentialsAction;
            const r = await action(fd);
            setMsg(r.ok ? {tone: "ok", text: "Saved."} : {tone: "err", text: r.error});
        });
    }

    return (
        <div className="space-y-6">
            <section>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Awards</h3>
                <ul className="space-y-2">
                    {awards.map((row, i) => (
                        <li
                            key={i}
                            className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_110px_auto]"
                        >
                            <div className="space-y-1">
                                <Label htmlFor={`aw-t-${i}`}>Title</Label>
                                <Input
                                    id={`aw-t-${i}`}
                                    value={row.title}
                                    onChange={(e) =>
                                        setAwards((rs) =>
                                            rs.map((r, idx) => (idx === i ? {...r, title: e.target.value} : r)),
                                        )
                                    }
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor={`aw-i-${i}`}>Issuer</Label>
                                <Input
                                    id={`aw-i-${i}`}
                                    value={row.issuer}
                                    onChange={(e) =>
                                        setAwards((rs) =>
                                            rs.map((r, idx) => (idx === i ? {...r, issuer: e.target.value} : r)),
                                        )
                                    }
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor={`aw-y-${i}`}>Year</Label>
                                <Input
                                    id={`aw-y-${i}`}
                                    type="number"
                                    min={1900}
                                    max={CURRENT_YEAR + 1}
                                    value={row.year}
                                    onChange={(e) =>
                                        setAwards((rs) =>
                                            rs.map((r, idx) => (idx === i ? {...r, year: e.target.value} : r)),
                                        )
                                    }
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setAwards((rs) => rs.filter((_, idx) => idx !== i))}
                                aria-label="Remove award"
                            >
                                <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                            </Button>
                        </li>
                    ))}
                </ul>
                <Button
                    variant="outline"
                    type="button"
                    className="mt-2"
                    onClick={() => setAwards((rs) => [...rs, {title: "", issuer: "", year: ""}])}
                >
                    <Plus className="size-4" aria-hidden="true" /> Add award
                </Button>
            </section>

            <section>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Memberships</h3>
                <ul className="space-y-2">
                    {memberships.map((row, i) => (
                        <li
                            key={i}
                            className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_110px_auto]"
                        >
                            <div className="space-y-1">
                                <Label htmlFor={`mb-b-${i}`}>Body</Label>
                                <Input
                                    id={`mb-b-${i}`}
                                    placeholder='e.g. "FCPS (Medicine)", "BMA"'
                                    value={row.body}
                                    onChange={(e) =>
                                        setMemberships((rs) =>
                                            rs.map((r, idx) => (idx === i ? {...r, body: e.target.value} : r)),
                                        )
                                    }
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor={`mb-r-${i}`}>Role (optional)</Label>
                                <Input
                                    id={`mb-r-${i}`}
                                    value={row.role}
                                    onChange={(e) =>
                                        setMemberships((rs) =>
                                            rs.map((r, idx) => (idx === i ? {...r, role: e.target.value} : r)),
                                        )
                                    }
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor={`mb-s-${i}`}>Since</Label>
                                <Input
                                    id={`mb-s-${i}`}
                                    type="number"
                                    min={1900}
                                    max={CURRENT_YEAR + 1}
                                    value={row.since}
                                    onChange={(e) =>
                                        setMemberships((rs) =>
                                            rs.map((r, idx) => (idx === i ? {...r, since: e.target.value} : r)),
                                        )
                                    }
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setMemberships((rs) => rs.filter((_, idx) => idx !== i))}
                                aria-label="Remove membership"
                            >
                                <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                            </Button>
                        </li>
                    ))}
                </ul>
                <Button
                    variant="outline"
                    type="button"
                    className="mt-2"
                    onClick={() => setMemberships((rs) => [...rs, {body: "", role: "", since: ""}])}
                >
                    <Plus className="size-4" aria-hidden="true" /> Add membership
                </Button>
            </section>

            <section>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Publications</h3>
                <ul className="space-y-2">
                    {publications.map((row, i) => (
                        <li
                            key={i}
                            className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_110px_1fr_auto]"
                        >
                            <div className="space-y-1">
                                <Label htmlFor={`pb-t-${i}`}>Title</Label>
                                <Input
                                    id={`pb-t-${i}`}
                                    value={row.title}
                                    onChange={(e) =>
                                        setPublications((rs) =>
                                            rs.map((r, idx) => (idx === i ? {...r, title: e.target.value} : r)),
                                        )
                                    }
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor={`pb-j-${i}`}>Journal</Label>
                                <Input
                                    id={`pb-j-${i}`}
                                    value={row.journal}
                                    onChange={(e) =>
                                        setPublications((rs) =>
                                            rs.map((r, idx) => (idx === i ? {...r, journal: e.target.value} : r)),
                                        )
                                    }
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor={`pb-y-${i}`}>Year</Label>
                                <Input
                                    id={`pb-y-${i}`}
                                    type="number"
                                    min={1900}
                                    max={CURRENT_YEAR + 1}
                                    value={row.year}
                                    onChange={(e) =>
                                        setPublications((rs) =>
                                            rs.map((r, idx) => (idx === i ? {...r, year: e.target.value} : r)),
                                        )
                                    }
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor={`pb-u-${i}`}>URL</Label>
                                <Input
                                    id={`pb-u-${i}`}
                                    type="url"
                                    value={row.url}
                                    onChange={(e) =>
                                        setPublications((rs) =>
                                            rs.map((r, idx) => (idx === i ? {...r, url: e.target.value} : r)),
                                        )
                                    }
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setPublications((rs) => rs.filter((_, idx) => idx !== i))}
                                aria-label="Remove publication"
                            >
                                <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                            </Button>
                        </li>
                    ))}
                </ul>
                <Button
                    variant="outline"
                    type="button"
                    className="mt-2"
                    onClick={() =>
                        setPublications((rs) => [...rs, {title: "", journal: "", year: "", url: ""}])
                    }
                >
                    <Plus className="size-4" aria-hidden="true" /> Add publication
                </Button>
            </section>

            <div className="flex items-center gap-3 border-t border-border pt-4">
                <Button type="button" onClick={save} disabled={pending}>
                    {pending ? "Saving…" : "Save credentials"}
                </Button>
                {msg ? (
                    <p className={msg.tone === "ok" ? "text-sm text-green-600" : "text-sm text-destructive"}>
                        {msg.text}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
