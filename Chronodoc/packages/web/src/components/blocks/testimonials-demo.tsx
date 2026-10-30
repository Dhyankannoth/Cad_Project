import { TestimonialsSection } from "@/components/blocks/testimonials-with-marquee"


const testimonials = [
    {
        author: {
            name: "Emma Thompson",
            handle: "@emmaai",
            avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face"
        },
        text: "DOCFLOW revolutionized how we maintain our codebase docs. AI-generated documentation that actually stays up to date — game changer.",
        href: "https://twitter.com/emmaai"
    },
    {
        author: {
            name: "David Park",
            handle: "@davidtech",
            avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face"
        },
        text: "The change intelligence feature is brilliant — it knows exactly which docs need updating when code changes. Zero manual work.",
        href: "https://twitter.com/davidtech"
    },
    {
        author: {
            name: "Sofia Rodriguez",
            handle: "@sofiaml",
            avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face"
        },
        text: "Finally, an AI tool that actually understands context! The accuracy in natural language processing is impressive."
    },
    {
        author: {
            name: "Omar Raza",
            handle: "@omarcto",
            avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face"
        },
        text: "DOCFLOW's dependency graph helped us find orphan files and dead code we didn't even know existed. Incredible tool."
    }
]

export function TestimonialsSectionDemo() {
    return (
        <TestimonialsSection
            title="Trusted by developers worldwide"
            description="Join thousands of developers who are already building the future with DOCFLOW"
            testimonials={testimonials}
        />
    )
}
