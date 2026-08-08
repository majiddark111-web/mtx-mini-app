import { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
export default function App() { return <Suspense fallback={<div className="route-loading" role="status" aria-label="Loading page"><i /><i /><i /></div>}><RouterProvider router={router} /></Suspense>; }
