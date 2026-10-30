import React, { Suspense, lazy } from 'react';

const Spline = lazy(() => import('@splinetool/react-spline'));

const SplineScene = ({ scene, className }) => {
    return (
        <Suspense
            fallback={
                <div className="spline-loader">
                    <div className="loader-ring"></div>
                </div>
            }
        >
            <Spline
                scene={scene}
                className={className}
                width="100%"
                height="100%"
            />
        </Suspense>
    );
};

export default SplineScene;
