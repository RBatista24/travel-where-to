import * as React from 'react';

/**
 * Announces a status change to screen readers without showing it on screen.
 * An empty message is silent, so the region can stay mounted while nothing is happening.
 */
function LiveRegion({ message }: { message: string }) {
    return <div role="status" className="sr-only">{message}</div>;
}

export { LiveRegion };
