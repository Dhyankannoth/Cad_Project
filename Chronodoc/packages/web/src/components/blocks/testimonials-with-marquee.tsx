import { cn } from "@/lib/utils"
import { TestimonialCard, TestimonialAuthor } from "@/components/ui/testimonial-card"

interface TestimonialsSectionProps {
    title: string
    description: string
    testimonials: Array<{
        author: TestimonialAuthor
        text: string
        href?: string
    }>
    className?: string
}

export function TestimonialsSection({
    title,
    description,
    testimonials,
    className
}: TestimonialsSectionProps) {
    return (
        <section id="testimonials" className={cn(
            "bg-background text-foreground",
            "py-32 sm:py-48 w-full overflow-hidden flex flex-col items-center",
            className
        )}>
            <div className="w-full max-w-[1100px] px-6 flex flex-col items-center gap-12 text-center mb-16">
                <div className="flex flex-col items-center gap-6">
                    <h2 className="text-4xl font-bold leading-tight sm:text-5xl tracking-tight max-w-[800px]">
                        {title}
                    </h2>
                    <p className="text-lg max-w-[600px] font-medium text-white/50 sm:text-xl leading-relaxed">
                        {description}
                    </p>
                </div>
            </div>

            <div className="relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] flex flex-row overflow-hidden group [--gap:2rem] [--duration:40s] justify-center">
                <div className="flex shrink-0 items-center [gap:var(--gap)] animate-marquee flex-row group-hover:[animation-play-state:paused] min-w-full">
                    <div className="flex shrink-0 items-center [gap:var(--gap)] flex-row">
                        {testimonials.map((testimonial, i) => (
                            <TestimonialCard
                                key={`set1-${i}`}
                                {...testimonial}
                            />
                        ))}
                    </div>
                    {/* Duplicate set inside the same animator for seamless flow */}
                    <div className="flex shrink-0 items-center [gap:var(--gap)] flex-row">
                        {testimonials.map((testimonial, i) => (
                            <TestimonialCard
                                key={`set2-${i}`}
                                {...testimonial}
                            />
                        ))}
                    </div>
                </div>

                <div className="pointer-events-none absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-background to-transparent z-10" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-background to-transparent z-10" />
            </div>
        </section>
    )
}
