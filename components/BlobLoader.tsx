import React from 'react';
import LoadingSpinner from './LoadingSpinner';

const BlobLoader: React.FC = () => {
  return (
    <LoadingSpinner size={144} text="Processing" />
  );
};

export default BlobLoader;
