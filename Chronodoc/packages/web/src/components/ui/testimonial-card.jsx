import { cn } from "@/lib/utils"
import { Avatar, AvatarImage } from "@/components/ui/avatar"

export function TestimonialCard({
    author,
    text,
    href,
    className
}) {
    const Card = href ? 'a' : 'div'

    return (
        <Card
            {...(href ? { href } : {})}
            className={cn(
                "flex flex-col rounded-2xl border border-white/10",
                "bg-gradient-to-br from-[#0a0a0a] to-[#0d0d0d] shadow-2xl shadow-black/50",
                "p-10 text-start sm:p-12",
                "hover:border-white/20 transition-all duration-500",
                "max-w-[400px] sm:max-w-[450px]",
                className
            )}
        >
            <div className="flex items-center gap-5">
                <Avatar className="h-16 w-16 border-2 border-white/5">
                    <AvatarImage src={author.avatar} alt={author.name} />
                </Avatar>
                <div className="flex flex-col items-start gap-1">
                    <h3 className="text-xl font-bold leading-tight tracking-tight text-white">
                        {author.name}
                    </h3>
                    <p className="text-base font-medium text-white/40 tracking-wide font-mono uppercase text-[10px]">
                        {author.handle}
                    </p>
                </div>
            </div>
            <p className="text-lg sm:text-xl mt-8 text-white/90 leading-[1.8] font-medium tracking-tight">
                “{text}”
            </p>
        </Card>
    )
}
