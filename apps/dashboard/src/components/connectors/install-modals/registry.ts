/**
 * Custom install-modal registry. Spec 0045.
 *
 * Catalog entries can declare `customInstallComponent: 'github-app'` (etc.)
 * to opt out of the default secret-fields modal and route to a bespoke
 * component. The default `catalog-install-modal.tsx` checks this registry
 * after fetching the catalog entry; if a component is registered, render it
 * instead of the default flow.
 */

import type { ComponentType } from 'react';
import { GitHubAppInstallModal } from './github-app-install-modal';

export interface CustomInstallModalProps {
  catalogId: string;
  onClose: () => void;
}

export const installModalRegistry: Record<string, ComponentType<CustomInstallModalProps>> = {
  'github-app': GitHubAppInstallModal,
};
