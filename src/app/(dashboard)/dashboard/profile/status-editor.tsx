"use client";

import {useState, useTransition} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {updateProfileStatusAction} from "@/server/actions/doctor";

type SubmitResult = {ok: true} | {ok: false; error: string};
type SubmitAction = (form: FormData) => Promise<SubmitResult>;

export function StatusEditor({
    initial,
    submitAction,
}: {
    initial: {
        designation?: string | null;
        institute?: string | null;
        yearsOfExperience?: number | null;
    };
    submitAction?: SubmitAction;
}) {
    const [designation, setDesignation] = useState(initial.designation ?? "");
    const [institute, setInstitute] = useState(initial.institute ?? "");
    const [years, setYears] = useState<string>(
        initial.yearsOfExperience != null ? String(initial.yearsOfExperience) : "",
    );
    const [pending, startTransition] = useTransition();
    const [msg, setMsg] = useState<{tone: "ok" | "err"; text: string} | null>(null);

    function save() {
        setMsg(null);
        startTransition(async () => {
            const fd = new FormData();
            fd.set("designation", designation);
            fd.set("institute", institute);
            fd.set("yearsOfExperience", years);
            const action = submitAction ?? updateProfileStatusAction;
            const r = await action(fd);
            setMsg(r.ok ? {tone: "ok", text: "Saved."} : {tone: "err", text: r.error});
        });
    }

    return (
        <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="designation">Designation</Label>
                <Input
                    id="designation"
                    placeholder='e.g. "Associate Professor of Cardiology"'
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                    Shown under your specialty on the public profile. Use the title you list on a prescription pad.
                </p>
            </div>
            <div className="space-y-1">
                <Label htmlFor="institute">Affiliated institute</Label>
                <Input
                    id="institute"
                    placeholder='e.g. "BSMMU", "DMCH", "NICVD"'
                    value={institute}
                    onChange={(e) => setInstitute(e.target.value)}
                />
            </div>
            <div className="space-y-1">
                <Label htmlFor="yearsOfExperience">Years of experience</Label>
                <Input
                    id="yearsOfExperience"
                    type="number"
                    min={0}
                    max={80}
                    placeholder="e.g. 18"
                    value={years}
                    onChange={(e) => setYears(e.target.value)}
                />
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
                <Button type="button" onClick={save} disabled={pending}>
                    {pending ? "Saving…" : "Save"}
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
