

import React from 'react';

const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex justify-center items-center my-8" aria-label="Loading content...">
      <span className="loading loading-spinner loading-lg text-primary"></span>
    </div>
  );
};

export default LoadingSpinner;