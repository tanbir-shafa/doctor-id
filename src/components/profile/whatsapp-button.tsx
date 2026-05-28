import { MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Request Appointment" CTA — opens WhatsApp with a pre-filled message.
 *
 * MVP has no in-product booking, so the doctor receives the request directly
 * via WhatsApp (the most common Bangladeshi channel for clinic appointments).
 */
export function WhatsappButton({
  whatsapp,
  doctorName,
}: {
  whatsapp: string | null | undefined;
  doctorName: string;
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
      className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
    >
      <MessageCircle className="size-4" aria-hidden="true" />
      Request appointment on WhatsApp
    </a>
  );
}
