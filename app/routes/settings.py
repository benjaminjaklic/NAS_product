from flask import Blueprint, request, redirect, url_for, make_response, render_template, flash, jsonify
from flask_login import login_required, current_user
from app.models import db, UserTheme
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

settings_bp = Blueprint('settings', __name__, url_prefix='/settings')


@settings_bp.route('/toggle_theme', methods=['POST'])
@login_required
def toggle_theme():
    """Toggle between light and dark mode"""
    current = request.cookies.get('theme', 'light')
    new_theme = 'dark' if current == 'light' else 'light'

    # Update user's theme in database if they have one
    if current_user.theme:
        current_user.theme.mode = new_theme
        # Apply dark/light defaults
        if new_theme == 'dark':
            defaults = UserTheme.get_dark_defaults()
        else:
            defaults = UserTheme.get_default_theme()
        
        current_user.theme.bg_body = defaults['bg_body']
        current_user.theme.bg_card = defaults['bg_card']
        current_user.theme.bg_nav = defaults['bg_nav']
        current_user.theme.text_primary = defaults['text_primary']
        current_user.theme.text_secondary = defaults['text_secondary']
        current_user.theme.border_color = defaults['border_color']
        db.session.commit()

    resp = make_response(redirect(request.referrer or url_for('files.dashboard')))
    resp.set_cookie('theme', new_theme, max_age=60*60*24*365)  # 1 year

    return resp


@settings_bp.route('/theme', methods=['GET', 'POST'])
@login_required
def theme_settings():
    """User theme customization page"""
    # Get or create user theme
    user_theme = current_user.theme
    if not user_theme:
        user_theme = UserTheme(
            user_id=current_user.id,
            mode=request.cookies.get('theme', 'light')
        )
        db.session.add(user_theme)
        db.session.commit()
    
    if request.method == 'POST':
        action = request.form.get('action')
        
        if action == 'save':
            # Update theme settings
            user_theme.name = request.form.get('theme_name', 'Custom')
            user_theme.color_primary = request.form.get('color_primary', '#4f46e5')
            user_theme.color_primary_hover = request.form.get('color_primary_hover', '#4338ca')
            user_theme.color_success = request.form.get('color_success', '#10b981')
            user_theme.color_warning = request.form.get('color_warning', '#f59e0b')
            user_theme.color_danger = request.form.get('color_danger', '#ef4444')
            user_theme.bg_body = request.form.get('bg_body', '#f8fafc')
            user_theme.bg_card = request.form.get('bg_card', '#ffffff')
            user_theme.bg_nav = request.form.get('bg_nav', '#ffffff')
            user_theme.text_primary = request.form.get('text_primary', '#0f172a')
            user_theme.text_secondary = request.form.get('text_secondary', '#475569')
            user_theme.border_color = request.form.get('border_color', '#e2e8f0')
            user_theme.border_radius = request.form.get('border_radius', '0.375rem')
            
            db.session.commit()
            logger.info(f"Theme updated for user {current_user.id}")
            flash('Theme settings saved successfully!', 'success')
            
        elif action == 'reset_light':
            # Reset to light theme defaults
            defaults = UserTheme.get_default_theme()
            for key, value in defaults.items():
                if hasattr(user_theme, key):
                    setattr(user_theme, key, value)
            db.session.commit()
            
            # Update cookie
            resp = make_response(redirect(url_for('settings.theme_settings')))
            resp.set_cookie('theme', 'light', max_age=60*60*24*365)
            flash('Theme reset to light defaults!', 'success')
            return resp
            
        elif action == 'reset_dark':
            # Reset to dark theme defaults
            defaults = UserTheme.get_dark_defaults()
            for key, value in defaults.items():
                if hasattr(user_theme, key):
                    setattr(user_theme, key, value)
            db.session.commit()
            
            # Update cookie
            resp = make_response(redirect(url_for('settings.theme_settings')))
            resp.set_cookie('theme', 'dark', max_age=60*60*24*365)
            flash('Theme reset to dark defaults!', 'success')
            return resp
        
        return redirect(url_for('settings.theme_settings'))
    
    # Get preset themes for selection
    presets = {
        'light': UserTheme.get_default_theme(),
        'dark': UserTheme.get_dark_defaults(),
    }
    
    return render_template('settings/theme.html', theme=user_theme, presets=presets)


@settings_bp.route('/theme/preview', methods=['POST'])
@login_required
def preview_theme():
    """Return CSS variables for theme preview (AJAX)"""
    data = request.get_json()
    
    css_vars = {
        '--color-primary': data.get('color_primary', '#4f46e5'),
        '--color-primary-hover': data.get('color_primary_hover', '#4338ca'),
        '--color-success': data.get('color_success', '#10b981'),
        '--color-warning': data.get('color_warning', '#f59e0b'),
        '--color-danger': data.get('color_danger', '#ef4444'),
        '--bg-body': data.get('bg_body', '#f8fafc'),
        '--bg-card': data.get('bg_card', '#ffffff'),
        '--bg-nav': data.get('bg_nav', '#ffffff'),
        '--text-primary': data.get('text_primary', '#0f172a'),
        '--text-secondary': data.get('text_secondary', '#475569'),
        '--border-color': data.get('border_color', '#e2e8f0'),
        '--radius': data.get('border_radius', '0.375rem'),
    }
    
    css_string = '; '.join([f'{k}: {v}' for k, v in css_vars.items()])
    
    return jsonify({'css': css_string, 'variables': css_vars})


@settings_bp.route('/theme/export', methods=['GET'])
@login_required
def export_theme():
    """Export user theme as JSON"""
    user_theme = current_user.theme
    if not user_theme:
        return jsonify({'error': 'No custom theme found'}), 404
    
    theme_data = {
        'name': user_theme.name,
        'mode': user_theme.mode,
        'colors': {
            'primary': user_theme.color_primary,
            'primary_hover': user_theme.color_primary_hover,
            'success': user_theme.color_success,
            'warning': user_theme.color_warning,
            'danger': user_theme.color_danger,
        },
        'backgrounds': {
            'body': user_theme.bg_body,
            'card': user_theme.bg_card,
            'nav': user_theme.bg_nav,
        },
        'text': {
            'primary': user_theme.text_primary,
            'secondary': user_theme.text_secondary,
        },
        'borders': {
            'color': user_theme.border_color,
            'radius': user_theme.border_radius,
        }
    }
    
    return jsonify(theme_data)
