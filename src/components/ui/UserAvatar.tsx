function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type UserAvatarProps = {
  name: string;
  imageUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'danger';
  className?: string;
};

export default function UserAvatar({
  name,
  imageUrl,
  size = 'sm',
  variant = 'primary',
  className = '',
}: UserAvatarProps) {
  const classes = `avatar avatar-${size} rounded-circle avatar-${variant} ${className}`.trim();

  if (imageUrl) {
    return (
      <span className={classes} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" />
      </span>
    );
  }

  return (
    <span className={classes} aria-hidden="true">
      <span className="avatar-initials">{initialsFromName(name)}</span>
    </span>
  );
}
