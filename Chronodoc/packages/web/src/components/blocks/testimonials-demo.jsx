import { TestimonialsSection } from "@/components/blocks/testimonials-with-marquee"
import testimonialsData from "@/data/testimonials.json"

export function TestimonialsSectionDemo() {
    return (
        <TestimonialsSection
            title="Trusted by developers worldwide"
            description="Join thousands of developers who are already building the future with DOCFLOW"
            testimonials={testimonialsData.marquee}
        />
    )
}
