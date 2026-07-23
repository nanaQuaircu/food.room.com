'use client';

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export default function TablePagination({ page, pageSize, total, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  if (total <= pageSize) return null;

  return (
    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 px-3 py-3 border-top">
      <small className="text-muted">
        Showing {start}–{end} of {total}
      </small>
      <div className="btn-group btn-group-sm">
        <button
          type="button"
          className="btn btn-outline-secondary"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          Previous
        </button>
        <span className="btn btn-light disabled text-dark border">
          {safePage} / {totalPages}
        </span>
        <button
          type="button"
          className="btn btn-outline-secondary"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function paginateSlice<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    totalPages,
    safePage,
  };
}
