import React, { useState, useEffect } from 'react';
import testimonialsData from '../data/testimonials.json';
import './StaggerTestimonials.css';

const SQRT_5000 = Math.sqrt(5000);

const testimonials = (testimonialsData.stagger || []).map((t, idx) => ({
    ...t,
    tempId: t.tempId || `initial-${t.id || idx}`
}));

const TestimonialCard = ({ position, testimonial, handleMove, cardSize }) => {
    const isCenter = position === 0;

    return (
        <div
            onClick={() => handleMove(position)}
            className={`testimonial-card ${isCenter ? 'center' : 'side'}`}
            style={{
                width: cardSize,
                height: cardSize,
                clipPath: `polygon(50px 0%, calc(100% - 50px) 0%, 100% 50px, 100% 100%, calc(100% - 50px) 100%, 50px 100%, 0 100%, 0 0)`,
                transform: `
                    translate(-50%, -50%)
                    translateX(${(cardSize / 1.5) * position}px)
                    translateY(${isCenter ? -65 : position % 2 ? 15 : -15}px)
                    rotate(${isCenter ? 0 : position % 2 ? 2.5 : -2.5}deg)
                `,
                boxShadow: isCenter
                    ? '0px 8px 0px 4px rgba(0, 128, 128, 0.4)'
                    : '0px 0px 0px 0px transparent'
            }}
        >
            <span
                className="card-corner-line"
                style={{
                    right: -2,
                    top: 48,
                    width: SQRT_5000,
                    height: 2
                }}
            />
            <img
                src={testimonial.imgSrc}
                alt={testimonial.by.split(',')[0]}
                className="testimonial-avatar"
            />
            <h3 className="testimonial-quote">
                "{testimonial.testimonial}"
            </h3>
            <p className="testimonial-author">
                - {testimonial.by}
            </p>
        </div>
    );
};

const StaggerTestimonials = () => {
    const [cardSize, setCardSize] = useState(365);
    const [testimonialsList, setTestimonialsList] = useState(testimonials);

    const handleMove = (steps) => {
        const newList = [...testimonialsList];
        if (steps > 0) {
            for (let i = steps; i > 0; i--) {
                const item = newList.shift();
                if (!item) return;
                newList.push({ ...item, tempId: Math.random() });
            }
        } else {
            for (let i = steps; i < 0; i++) {
                const item = newList.pop();
                if (!item) return;
                newList.unshift({ ...item, tempId: Math.random() });
            }
        }
        setTestimonialsList(newList);
    };

    useEffect(() => {
        const updateSize = () => {
            const { matches } = window.matchMedia("(min-width: 640px)");
            setCardSize(matches ? 365 : 290);
        };
        updateSize();
        window.addEventListener("resize", updateSize);
        return () => window.removeEventListener("resize", updateSize);
    }, []);

    return (
        <div className="stagger-testimonials-wrap" style={{ height: 600 }}>
            {testimonialsList.map((testimonial, index) => {
                const position = testimonialsList.length % 2
                    ? index - (testimonialsList.length + 1) / 2
                    : index - testimonialsList.length / 2;
                return (
                    <TestimonialCard
                        key={testimonial.tempId}
                        testimonial={testimonial}
                        handleMove={handleMove}
                        position={position}
                        cardSize={cardSize}
                    />
                );
            })}
            <div className="testimonial-nav-buttons">
                <button
                    onClick={() => handleMove(-1)}
                    className="testimonial-nav-btn"
                    aria-label="Previous testimonial"
                >
                    <i className='bx bx-chevron-left'></i>
                </button>
                <button
                    onClick={() => handleMove(1)}
                    className="testimonial-nav-btn"
                    aria-label="Next testimonial"
                >
                    <i className='bx bx-chevron-right'></i>
                </button>
            </div>
        </div>
    );
};

export default StaggerTestimonials;
