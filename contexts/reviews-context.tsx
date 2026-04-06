"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

export type Review = {
  id: string;
  name: string;
  location: string;
  text: string;
  rating: number;
  date: string; // ISO string
  photo?: string; // base64 data URL
};

type ReviewModalState = { open: false } | { open: true; customerName: string; customerLocation: string };

type ReviewsCtx = {
  reviews: Review[];
  addReview: (r: Omit<Review, "id" | "date">) => void;
  reviewModal: ReviewModalState;
  openReviewModal: (customerName: string, customerLocation: string) => void;
  closeReviewModal: () => void;
};

const ReviewsContext = createContext<ReviewsCtx | null>(null);

const STORAGE_KEY = "bsm-reviews";

export function ReviewsProvider({ children }: { children: ReactNode }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewModal, setReviewModal] = useState<ReviewModalState>({ open: false });

  useEffect(() => {
    // Fetch from server; fall back to localStorage cache if fetch fails
    fetch("/api/reviews")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Review[] | null) => {
        if (Array.isArray(data) && data.length > 0) {
          setReviews(data);
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
        } else {
          // API returned empty — try localStorage as fallback
          try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length > 0) setReviews(parsed);
            }
          } catch {}
        }
      })
      .catch(() => {
        // Network error — try localStorage cache
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) setReviews(parsed);
          }
        } catch {}
      });
  }, []);

  const addReview = useCallback((r: Omit<Review, "id" | "date">) => {
    const newReview: Review = {
      ...r,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: new Date().toISOString(),
    };
    setReviews((prev) => {
      const updated = [newReview, ...prev];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
    // Sync to backend (fire-and-forget)
    fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newReview),
    }).catch(() => {});
  }, []);

  const openReviewModal = useCallback((customerName: string, customerLocation: string) => {
    setReviewModal({ open: true, customerName, customerLocation });
  }, []);

  const closeReviewModal = useCallback(() => setReviewModal({ open: false }), []);

  return (
    <ReviewsContext.Provider value={{ reviews, addReview, reviewModal, openReviewModal, closeReviewModal }}>
      {children}
    </ReviewsContext.Provider>
  );
}

export function useReviews() {
  const ctx = useContext(ReviewsContext);
  if (!ctx) throw new Error("useReviews must be inside ReviewsProvider");
  return ctx;
}
