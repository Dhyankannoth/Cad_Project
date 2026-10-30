"use client";
import React from "react";
import { motion } from "motion/react";

export const TestimonialsColumn = (props) => {
    return (
        <div className={props.className}>
            <motion.div
                animate={{
                    translateY: "-50%",
                }}
                transition={{
                    duration: props.duration || 10,
                    repeat: Infinity,
                    ease: "linear",
                    repeatType: "loop",
                }}
                className="flex flex-col gap-6 pb-6 bg-background"
            >
                {[
                    ...new Array(2).fill(0).map((_, index) => (
                        <React.Fragment key={index}>
                            {props.testimonials.map(({ text, image, name, role }, i) => (
                                <div className="p-6 rounded-3xl border border-[#222] bg-[#0a0a0a] shadow-lg shadow-primary/10 max-w-sm w-full overflow-hidden text-foreground" key={i}>
                                    <div className="text-sm leading-relaxed">{text}</div>
                                    <div className="flex items-center gap-2 mt-4">
                                        <img
                                            width={40}
                                            height={40}
                                            src={image}
                                            alt={name}
                                            className="h-10 w-10 rounded-full"
                                        />
                                        <div className="flex flex-col">
                                            <div className="font-medium tracking-tight leading-5">{name}</div>
                                            <div className="leading-5 opacity-60 tracking-tight">{role}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </React.Fragment>
                    )),
                ]}
            </motion.div>
        </div>
    );
};
