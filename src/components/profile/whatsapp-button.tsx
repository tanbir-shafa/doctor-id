import { MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Chat on WhatsApp" CTA — opens WhatsApp with a pre-filled message.
 *
 * Always renders full-width in its container; the surrounding card is narrow
 * on lg+ (one of three columns), so a natural-width button overflows. The
 * base Button has `whitespace-nowrap` — we override it here so the label
 * wraps on the rare narrowest viewports rather than punching out the card.
 */
export function WhatsappButton({
  whatsapp,
  doctorName,
  label = "Chat on WhatsApp",
  variant = "default",
}: {
  whatsapp: string | null | undefined;
  doctorName: string;
  label?: string;
  variant?: "default" | "outline";
}) {
  if (!whatsapp) return null;
  const digits = whatsapp.replace(/\D/g, "");
  const text = `Hello Dr. ${doctorName}, I would like to book an appointment.`;
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        buttonVariants({ variant, size: "lg" }),
        "w-full whitespace-normal text-center leading-tight",
      )}
    >
      <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </a>
  );
}
