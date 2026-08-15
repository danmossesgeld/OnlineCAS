import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { app } from './firebase';

/**
 * Single source of truth for the business's own BIR identity — the seller-side fields every
 * generated Sales Invoice/Official Receipt/2307 face needs (RA 11976 EOPT Act, RR 3-2024) but
 * that nothing in this codebase captured before this module (see BLUEPRINT.md §8.1). Lives as
 * one singleton document, not a masterlist/otherlist entity, since there is exactly one company.
 */
export interface CompanyProfile {
  registeredName: string;
  tradeName: string;
  tin: string;
  rdoCode: string;
  registeredAddress: string;
  vatStatus: 'vat' | 'non-vat';
  lineOfBusiness: string;
  contactNumber: string;
  email: string;
  updatedAt?: Date;
  updatedBy?: string;
}

export const EMPTY_COMPANY_PROFILE: CompanyProfile = {
  registeredName: '',
  tradeName: '',
  tin: '',
  rdoCode: '',
  registeredAddress: '',
  vatStatus: 'vat',
  lineOfBusiness: '',
  contactNumber: '',
  email: ''
};

const DOC_PATH = ['listdatabase', 'companyProfile'] as const;

export async function getCompanyProfile(): Promise<CompanyProfile | null> {
  const db = getFirestore(app);
  const snap = await getDoc(doc(db, ...DOC_PATH));
  return snap.exists() ? (snap.data() as CompanyProfile) : null;
}

export async function saveCompanyProfile(profile: CompanyProfile, updatedByUid: string): Promise<void> {
  const db = getFirestore(app);
  await setDoc(doc(db, ...DOC_PATH), { ...profile, updatedAt: new Date(), updatedBy: updatedByUid }, { merge: true });
}
