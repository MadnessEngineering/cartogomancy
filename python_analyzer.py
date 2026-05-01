#!/usr/bin/env python3
"""
python_analyzer.py — Python AST analyzer for cartogomancy v7.0 UML schema.

Generates the same JSON structure as cartogomancy's JS analyzer, but for Python
codebases. Uses `ast` for structure, `radon` for cyclomatic/cognitive complexity,
and `subprocess` for git metrics.

Usage:
    python3 python_analyzer.py /path/to/project [--output file.json] [--exclude tests,docs]

Dependencies: radon (pip install radon)
"""

import ast
import os
import sys
import json
import hashlib
import subprocess
from datetime import datetime, timezone
from pathlib import Path

try:
    from radon.complexity import cc_visit
    from radon.metrics import mi_visit
    HAS_RADON = True
except ImportError:
    HAS_RADON = False
    print("Warning: radon not installed. Complexity metrics will be estimated from AST.", file=sys.stderr)


def generate_id(name, filepath):
    """Generate a stable class ID from name + filepath."""
    h = hashlib.md5(f"{filepath}:{name}".encode()).hexdigest()[:7]
    return f"class_{h}"


def count_complexity_nodes(node):
    """Estimate cyclomatic complexity by counting branch nodes in AST."""
    count = 0
    for child in ast.walk(node):
        if isinstance(child, (ast.If, ast.For, ast.While, ast.ExceptHandler,
                              ast.With, ast.Assert)):
            count += 1
        elif isinstance(child, ast.BoolOp):
            count += len(child.values) - 1
    return count + 1


def get_nesting_depth(node, depth=0):
    """Get maximum nesting depth of a node."""
    max_depth = depth
    for child in ast.iter_child_nodes(node):
        if isinstance(child, (ast.If, ast.For, ast.While, ast.With,
                              ast.Try, ast.ExceptHandler)):
            max_depth = max(max_depth, get_nesting_depth(child, depth + 1))
        else:
            max_depth = max(max_depth, get_nesting_depth(child, depth))
    return max_depth


def threat_level(cc):
    """Map cyclomatic complexity to threat level."""
    if cc <= 5:
        return ("LOW", "green")
    elif cc <= 10:
        return ("MEDIUM", "yellow")
    elif cc <= 20:
        return ("HIGH", "orange")
    else:
        return ("CRITICAL", "red")


def get_suggestions(cc, nesting, loc):
    """Generate improvement suggestions based on metrics."""
    suggestions = []
    if cc > 15:
        suggestions.append("Break down into smaller methods or components")
    if nesting > 4:
        suggestions.append("Reduce nesting depth using early returns or guard clauses")
    if cc > 10:
        suggestions.append("Simplify logic to improve readability")
    if loc > 300:
        suggestions.append("Consider splitting into multiple smaller files")
    if not suggestions:
        suggestions.append("Code complexity is within acceptable limits")
    return suggestions


def extract_methods(node):
    """Extract method/function definitions from a class or module-level node."""
    methods = []
    for item in ast.iter_child_nodes(node):
        if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
            params = []
            for arg in item.args.args:
                if arg.arg != 'self' and arg.arg != 'cls':
                    params.append(arg.arg)

            visibility = "private" if item.name.startswith('_') else "public"
            is_async = isinstance(item, ast.AsyncFunctionDef)
            is_static = any(
                isinstance(d, ast.Name) and d.id == 'staticmethod'
                for d in item.decorator_list
            )

            methods.append({
                "name": item.name,
                "visibility": visibility,
                "type": "method",
                "isAsync": is_async,
                "isStatic": is_static,
                "parameters": params,
                "returnType": None,
                "signature": f"{'async ' if is_async else ''}def {item.name}({', '.join(params)})"
            })
    return methods


def extract_fields(node):
    """Extract class-level field assignments."""
    fields = []
    seen = set()
    for item in ast.iter_child_nodes(node):
        # Class-level assignments: x = ... or x: Type = ...
        if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
            name = item.target.id
            if name not in seen:
                seen.add(name)
                fields.append({
                    "name": name,
                    "visibility": "private" if name.startswith('_') else "public",
                    "type": "field"
                })
        elif isinstance(item, ast.Assign):
            for target in item.targets:
                if isinstance(target, ast.Name) and target.id not in seen:
                    seen.add(target.id)
                    fields.append({
                        "name": target.id,
                        "visibility": "private" if target.id.startswith('_') else "public",
                        "type": "field"
                    })
    return fields


def extract_imports(tree):
    """Extract import names from an AST tree."""
    imports = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                imports.append(node.module)
    return imports


def get_radon_complexity(source, filepath):
    """Get cyclomatic complexity from radon for all functions in a file."""
    if not HAS_RADON:
        return {}
    try:
        results = cc_visit(source)
        # Map function/class name to complexity
        cc_map = {}
        for block in results:
            cc_map[block.name] = {
                "cc": block.complexity,
                "rank": block.letter
            }
        return cc_map
    except Exception:
        return {}


def get_git_metrics(filepath, project_root):
    """Get git metrics for a file."""
    rel_path = os.path.relpath(filepath, project_root)
    metrics = {
        "isGitTracked": False,
        "commitCount": 0,
        "contributors": [],
        "churnRate": 0,
        "bugFixRatio": 0,
        "createdDate": None,
        "fileAge": 0,
        "totalLinesChanged": 0,
        "lastCommit": None
    }

    try:
        # Check if tracked
        result = subprocess.run(
            ["git", "log", "--oneline", "-1", "--", rel_path],
            capture_output=True, text=True, cwd=project_root, timeout=5
        )
        if not result.stdout.strip():
            return metrics
        metrics["isGitTracked"] = True

        # Commit count
        result = subprocess.run(
            ["git", "log", "--oneline", "--", rel_path],
            capture_output=True, text=True, cwd=project_root, timeout=5
        )
        commits = result.stdout.strip().split('\n')
        metrics["commitCount"] = len(commits) if commits[0] else 0

        # Contributors
        result = subprocess.run(
            ["git", "shortlog", "-sne", "--", rel_path],
            capture_output=True, text=True, cwd=project_root, timeout=5
        )
        contribs = []
        for line in result.stdout.strip().split('\n'):
            line = line.strip()
            if not line:
                continue
            parts = line.split('\t', 1)
            if len(parts) == 2:
                count = int(parts[0].strip())
                # Parse "Name <email>"
                author = parts[1].strip()
                name = author.split('<')[0].strip() if '<' in author else author
                email = author.split('<')[1].rstrip('>') if '<' in author else ""
                contribs.append({"name": name, "email": email, "commitCount": count})
        metrics["contributors"] = contribs

        # Last commit
        result = subprocess.run(
            ["git", "log", "-1", "--format=%H%n%aI%n%an%n%ae%n%s", "--", rel_path],
            capture_output=True, text=True, cwd=project_root, timeout=5
        )
        lines = result.stdout.strip().split('\n')
        if len(lines) >= 5:
            commit_date = lines[1]
            try:
                dt = datetime.fromisoformat(commit_date)
                days_ago = (datetime.now(timezone.utc) - dt).days
            except (ValueError, TypeError):
                days_ago = 0
            metrics["lastCommit"] = {
                "hash": lines[0][:7],
                "date": commit_date,
                "author": lines[2],
                "email": lines[3],
                "message": lines[4],
                "daysAgo": days_ago
            }

        # First commit date (file creation)
        result = subprocess.run(
            ["git", "log", "--reverse", "--format=%aI", "-1", "--", rel_path],
            capture_output=True, text=True, cwd=project_root, timeout=5
        )
        if result.stdout.strip():
            metrics["createdDate"] = result.stdout.strip()
            try:
                created = datetime.fromisoformat(result.stdout.strip())
                metrics["fileAge"] = (datetime.now(timezone.utc) - created).days
            except (ValueError, TypeError):
                pass

        # Lines changed (churn)
        result = subprocess.run(
            ["git", "log", "--numstat", "--format=", "--", rel_path],
            capture_output=True, text=True, cwd=project_root, timeout=5
        )
        total_lines = 0
        for line in result.stdout.strip().split('\n'):
            parts = line.split('\t')
            if len(parts) >= 2:
                try:
                    total_lines += int(parts[0]) + int(parts[1])
                except ValueError:
                    pass
        metrics["totalLinesChanged"] = total_lines
        if metrics["fileAge"] > 0:
            metrics["churnRate"] = round(total_lines / metrics["fileAge"], 2)

        # Bug fix ratio
        if metrics["commitCount"] > 0:
            result = subprocess.run(
                ["git", "log", "--oneline", "--grep=fix", "-i", "--", rel_path],
                capture_output=True, text=True, cwd=project_root, timeout=5
            )
            fix_commits = len([l for l in result.stdout.strip().split('\n') if l.strip()])
            metrics["bugFixRatio"] = round(fix_commits / metrics["commitCount"], 2)

    except (subprocess.TimeoutExpired, FileNotFoundError, Exception):
        pass

    return metrics


def analyze_file(filepath, project_root):
    """Analyze a single Python file, return list of class/function entries."""
    rel_path = os.path.relpath(filepath, project_root)
    package = os.path.dirname(rel_path).replace(os.sep, '/')

    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            source = f.read()
    except Exception:
        return []

    try:
        tree = ast.parse(source, filename=filepath)
    except SyntaxError:
        return []

    lines = source.split('\n')
    total_loc = len(lines)
    imports = extract_imports(tree)
    radon_cc = get_radon_complexity(source, filepath)
    git_metrics = get_git_metrics(filepath, project_root)

    entries = []

    for node in ast.iter_child_nodes(tree):
        if isinstance(node, ast.ClassDef):
            methods = extract_methods(node)
            fields = extract_fields(node)

            # Get line range
            end_line = getattr(node, 'end_lineno', node.lineno + 20)
            loc = end_line - node.lineno + 1

            # Complexity
            cc = radon_cc.get(node.name, {}).get("cc", count_complexity_nodes(node))
            nesting = get_nesting_depth(node)
            tl, tc = threat_level(cc)

            # Detect subtype
            subtype = "class"
            for deco in node.decorator_list:
                deco_name = ""
                if isinstance(deco, ast.Name):
                    deco_name = deco.id
                elif isinstance(deco, ast.Attribute):
                    deco_name = deco.attr
                if deco_name == "dataclass":
                    subtype = "dataclass"

            entries.append({
                "id": generate_id(node.name, rel_path),
                "name": node.name,
                "type": "class",
                "subtype": subtype,
                "package": package or "root",
                "filePath": rel_path,
                "methods": methods,
                "fields": fields,
                "dependencies": imports,
                "extends": [base.id for base in node.bases if isinstance(base, ast.Name)] if node.bases else [],
                "implements": [],
                "complexity": cc,
                "complexityMetrics": {
                    "cyclomaticComplexity": cc,
                    "cognitiveComplexity": int(cc * 0.8),
                    "nestingDepth": nesting,
                    "linesOfCode": loc,
                    "methodCount": len(methods),
                    "threatLevel": tl,
                    "threatColor": tc,
                    "label": tl,
                    "suggestions": get_suggestions(cc, nesting, loc)
                },
                "gitMetrics": git_metrics,
                "coverageMetrics": {
                    "hasCoverage": False,
                    "overallCoverage": 0,
                    "hasTests": False
                },
                "testMetrics": {
                    "exists": False,
                    "coverage": 0
                },
                "redundancyAnalysis": None,
                "importUsage": None
            })

        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            # Top-level functions
            end_line = getattr(node, 'end_lineno', node.lineno + 10)
            loc = end_line - node.lineno + 1
            cc = radon_cc.get(node.name, {}).get("cc", count_complexity_nodes(node))
            nesting = get_nesting_depth(node)
            tl, tc = threat_level(cc)
            is_async = isinstance(node, ast.AsyncFunctionDef)

            params = [arg.arg for arg in node.args.args if arg.arg not in ('self', 'cls')]

            entries.append({
                "id": generate_id(node.name, rel_path),
                "name": node.name,
                "type": "utility",
                "subtype": "function",
                "package": package or "root",
                "filePath": rel_path,
                "methods": [{
                    "name": node.name,
                    "visibility": "private" if node.name.startswith('_') else "public",
                    "type": "method",
                    "isAsync": is_async,
                    "isStatic": False,
                    "parameters": params,
                    "returnType": None,
                    "signature": f"{'async ' if is_async else ''}def {node.name}({', '.join(params)})"
                }],
                "fields": [],
                "dependencies": imports,
                "extends": [],
                "implements": [],
                "complexity": cc,
                "complexityMetrics": {
                    "cyclomaticComplexity": cc,
                    "cognitiveComplexity": int(cc * 0.8),
                    "nestingDepth": nesting,
                    "linesOfCode": loc,
                    "methodCount": 1,
                    "threatLevel": tl,
                    "threatColor": tc,
                    "label": tl,
                    "suggestions": get_suggestions(cc, nesting, loc)
                },
                "gitMetrics": git_metrics,
                "coverageMetrics": {
                    "hasCoverage": False,
                    "overallCoverage": 0,
                    "hasTests": False
                },
                "testMetrics": {
                    "exists": False,
                    "coverage": 0
                },
                "redundancyAnalysis": None,
                "importUsage": None
            })

    return entries


def analyze_project(project_path, exclude_patterns=None):
    """Analyze an entire Python project."""
    project_path = os.path.abspath(project_path)
    exclude_patterns = exclude_patterns or []
    default_excludes = ['node_modules', '__pycache__', '.git', 'venv', '.venv',
                        'env', '.env', 'dist', 'build', '.tox', '.eggs', '*.egg-info']
    all_excludes = set(exclude_patterns + default_excludes)

    # Find all .py files
    py_files = []
    for root, dirs, files in os.walk(project_path):
        # Filter directories
        dirs[:] = [d for d in dirs if d not in all_excludes and not d.endswith('.egg-info')]
        for f in files:
            if f.endswith('.py'):
                py_files.append(os.path.join(root, f))

    print(f"Found {len(py_files)} Python files", file=sys.stderr)

    # Detect project name
    project_name = os.path.basename(project_path)
    project_desc = f"Python project: {project_name}"
    pkg_info = os.path.join(project_path, 'pyproject.toml')
    if os.path.exists(pkg_info):
        try:
            with open(pkg_info) as f:
                content = f.read()
                for line in content.split('\n'):
                    if line.strip().startswith('description'):
                        project_desc = line.split('=', 1)[1].strip().strip('"\'')
                        break
        except Exception:
            pass

    all_classes = []
    packages = {}

    for filepath in sorted(py_files):
        entries = analyze_file(filepath, project_path)
        rel_path = os.path.relpath(filepath, project_path)
        pkg = os.path.dirname(rel_path).replace(os.sep, '/') or "root"

        if pkg not in packages:
            packages[pkg] = {
                "id": f"package_{hashlib.md5(pkg.encode()).hexdigest()[:5]}",
                "name": pkg,
                "path": pkg,
                "classes": []
            }

        for entry in entries:
            packages[pkg]["classes"].append(entry["id"])
            all_classes.append(entry)

        if entries:
            print(f"  {rel_path}: {len(entries)} entries", file=sys.stderr)

    # Build output
    output = {
        "version": "7.0",
        "generated": datetime.now(timezone.utc).isoformat(),
        "project": {
            "name": project_name,
            "description": project_desc,
            "language": "Python"
        },
        "packages": list(packages.values()),
        "classes": all_classes,
        "complexityAnalysis": None,
        "gitAnalysis": None,
        "importAnalysis": None,
        "redundancyAnalysis": None
    }

    return output


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 python_analyzer.py /path/to/project [--output file.json] [--exclude tests,docs]")
        sys.exit(1)

    project_path = sys.argv[1]
    output_file = None
    exclude = []

    i = 2
    while i < len(sys.argv):
        if sys.argv[i] == '--output' and i + 1 < len(sys.argv):
            output_file = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] == '--exclude' and i + 1 < len(sys.argv):
            exclude = sys.argv[i + 1].split(',')
            i += 2
        else:
            i += 1

    if not os.path.isdir(project_path):
        print(f"Error: {project_path} is not a directory", file=sys.stderr)
        sys.exit(1)

    result = analyze_project(project_path, exclude)

    if output_file:
        with open(output_file, 'w') as f:
            json.dump(result, f, indent=2)
        print(f"Wrote {len(result['classes'])} entries to {output_file}", file=sys.stderr)
    else:
        json.dump(result, sys.stdout, indent=2)


if __name__ == '__main__':
    main()
